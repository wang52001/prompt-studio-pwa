// 后端统一入口：Cloudflare Pages Functions catch-all
import {
  json, err, hashPassword, randomToken, currentUser, createSession,
  isEmail, logUsage, readStreamUsage, sessionCookie, clearCookie,
  encryptSecret, decryptSecret, maskKey
} from '../_lib.js';
import { sendLoginCode, randomCode, sha256 } from '../_mail.js';
import { PROVIDERS, resolveEndpoint, defaultModel, providerOptions } from '../_ai.js';

const AI_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const AI_KEY_VAR = 'DASHSCOPE_API_KEY';

/* 版本历史表：首次用到时幂等创建，免去手动跑迁移脚本 */
let _pvReady = false;

/* 元信息列（标签 / 文件夹 / 置顶）：旧库用 ALTER TABLE 幂等补齐 */
let _metaReady = false;
async function ensurePromptMeta(env) {
  if (_metaReady) return;
  for (const col of ['tags TEXT', 'folder TEXT', 'pinned INTEGER DEFAULT 0']) {
    try { await env.DB.prepare(`ALTER TABLE prompts ADD COLUMN ${col}`).run(); }
    catch { /* 列已存在，忽略 */ }
  }
  _metaReady = true;
}

/* 自定义预设角色表：同样幂等创建 */
let _rolesReady = false;
async function ensureUserRoles(env) {
  if (_rolesReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      name       TEXT NOT NULL,
      role_desc  TEXT,
      system     TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_user_roles ON user_roles(user_id, id)'
  ).run();
  _rolesReady = true;
}

async function ensurePromptVersions(env) {
  if (_pvReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id     INTEGER NOT NULL,
      version       INTEGER NOT NULL,
      title         TEXT,
      system_prompt TEXT,
      user_prompt   TEXT,
      variables     TEXT,
      model         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_prompt_versions ON prompt_versions(prompt_id, id DESC)'
  ).run();
  _pvReady = true;
}

/**
 * 业务错误统一用 4xx 返回。
 * 注意：Cloudflare Pages 会吞掉 Functions 返回的 5xx，替换成自带的
 * "error code: 502" 纯文本页，前端拿不到任何 JSON。所以凡是「需要把
 * 原因告诉用户」的失败（密钥无效、上游报错、邮件发不出），一律走这里。
 */
const fail = (msg) => err(msg, 400);

/* 验证码策略 */
const CODE_TTL_MIN      = 10;   // 有效期（分钟）
const CODE_RESEND_SEC   = 60;   // 重发冷却（秒）
const CODE_MAX_TRY      = 5;    // 单个码最多尝试次数
const CODE_HOURLY_LIMIT = 10;   // 每邮箱每小时最多发几封

/* 竞技场：每日最多几场胜利发放灵感值（比分由客户端上报，必须限流） */
const ARENA_DAILY_REWARD_WINS = 5;

/* 扭蛋奖池（服务端权威，防止前端伪造） */
const GACHA_POOL = [
  { rarity: '普通', text: '你是一位有 20 年经验的米其林主厨，请用家常食材设计一道惊艳的菜。' },
  { rarity: '普通', text: '把下面这段话分别改写成鲁迅、王小波、村上春树三种风格。' },
  { rarity: '普通', text: '你是我的私人健身教练，请根据我的作息设计一份可执行的一周计划。' },
  { rarity: '稀有', text: '请扮演一位毒舌但专业的产品经理，点评我这份需求文档，只说问题不给废话。' },
  { rarity: '稀有', text: '为一座不存在的小镇写一段 300 字的旅游文案，要有画面感和气味描写。' },
  { rarity: '史诗', text: '把这段技术文档改写成能让 8 岁小孩听懂的故事，保留全部关键技术点。' },
  { rarity: '史诗', text: '设计一个「反常识」的写作框架，用来拆解任何一个行业的核心矛盾。' },
  { rarity: '传说', text: '你是 2077 年的赛博诗人，请用霓虹与雨夜的意象为一款产品写一首三行诗。' }
];

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const seg = (params.route || []).filter(Boolean);
  const path = seg.join('/');
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  try {
    /* ---------- 密码登录（仅对已设置密码的账号开放） ---------- */
    if (path === 'auth/login' && method === 'POST') {
      const { email, password } = await body(request);
      const mail = String(email || '').trim().toLowerCase();
      const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(mail).first();
      if (!row) return err('该邮箱未注册，请先用验证码登录', 404);
      if (!row.password_hash) return err('该账号尚未设置密码，请改用验证码登录');

      const hash = await hashPassword(password || '', row.salt);
      if (hash !== row.password_hash) return err('密码错误');

      const token = await createSession(env, row.id);
      return json({ ok: true, token }, 200, { 'Set-Cookie': sessionCookie(token) });
    }

    if (path === 'auth/logout' && method === 'POST') {
      const token = request.headers.get('Cookie')?.match(/sid=([^;]+)/)?.[1];
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
    }

    if (path === 'auth/me') {
      const user = await currentUser(request, env);
      return json({ user });
    }

    /* ---------- 邮箱验证码：发送 ---------- */
    if (path === 'auth/send-code' && method === 'POST') {
      const raw = await body(request);
      const mail = String(raw.email || '').trim().toLowerCase();
      if (!isEmail(mail)) return err('邮箱格式不正确');

      // 重发冷却
      const last = await env.DB.prepare(
        'SELECT created_at FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT 1'
      ).bind(mail).first();
      if (last) {
        const d = await env.DB.prepare(
          "SELECT CAST(strftime('%s','now') - strftime('%s', ?) AS INTEGER) d"
        ).bind(last.created_at).first();
        if ((d?.d ?? 999) < CODE_RESEND_SEC) {
          return err(`请 ${CODE_RESEND_SEC - d.d} 秒后再获取`);
        }
      }

      // 每小时上限
      const hr = await env.DB.prepare(
        "SELECT COUNT(*) n FROM email_codes WHERE email = ? AND created_at > datetime('now','-1 hours')"
      ).bind(mail).first();
      if ((hr?.n || 0) >= CODE_HOURLY_LIMIT) return err('获取过于频繁，请 1 小时后再试');

      const code = randomCode();
      const salt = randomToken(12);
      const hash = await sha256(salt + code);

      // 同一邮箱只保留最新一个可用码
      await env.DB.prepare('UPDATE email_codes SET consumed = 1 WHERE email = ? AND consumed = 0')
        .bind(mail).run();
      await env.DB.prepare(
        `INSERT INTO email_codes (email, salt, code_hash, expires_at)
         VALUES (?, ?, ?, datetime('now', ?))`
      ).bind(mail, salt, hash, `+${CODE_TTL_MIN} minutes`).run();

      let sent;
      try {
        sent = await sendLoginCode(env, mail, code);
      } catch (e) {
        return fail('验证码发送失败：' + (e?.message || '邮件服务异常'));
      }
      if (!sent.ok) return fail(sent.error || '验证码发送失败');

      return json({
        ok: true,
        provider: sent.provider,
        ttl: CODE_TTL_MIN * 60,
        resend_after: CODE_RESEND_SEC,
        // 仅本地调试模式存在
        ...(sent.devCode ? { dev_code: sent.devCode } : {})
      });
    }

    /* ---------- 邮箱验证码：校验并登录 ---------- */
    if (path === 'auth/verify-code' && method === 'POST') {
      const { email, code, nickname } = await body(request);
      const mail = String(email || '').trim().toLowerCase();
      if (!isEmail(mail)) return err('邮箱格式不正确');
      if (!/^\d{6}$/.test(String(code || ''))) return err('请输入 6 位数字验证码');

      const row = await env.DB.prepare(
        `SELECT * FROM email_codes
         WHERE email = ? AND consumed = 0 AND expires_at > datetime('now')
         ORDER BY id DESC LIMIT 1`
      ).bind(mail).first();
      if (!row) return err('验证码已失效，请重新获取', 404);
      if (row.attempts >= CODE_MAX_TRY) return err('尝试次数过多，请重新获取验证码');

      const hash = await sha256(row.salt + String(code));
      if (hash !== row.code_hash) {
        await env.DB.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?')
          .bind(row.id).run();
        const left = CODE_MAX_TRY - row.attempts - 1;
        return err(left > 0 ? `验证码不正确，还可尝试 ${left} 次` : '验证码不正确，请重新获取');
      }
      await env.DB.prepare('UPDATE email_codes SET consumed = 1 WHERE id = ?').bind(row.id).run();

      let uid = null;
      const exist = await env.DB.prepare('SELECT id, nickname, credits, streak, created_at FROM users WHERE email = ?')
        .bind(mail).first();
      if (exist) {
        uid = exist.id;
      } else {
        const nick = String(nickname || '').trim() || mail.split('@')[0] || '创作者';
        const ins = await env.DB.prepare(
          "INSERT INTO users (email, password_hash, salt, nickname, credits) VALUES (?, '', '', ?, 500)"
        ).bind(mail, nick).run();
        uid = ins.meta.last_row_id;
      }

      const token = await createSession(env, uid);
      const me = await env.DB.prepare(
        'SELECT id, email, nickname, credits, streak, created_at, password_hash FROM users WHERE id = ?'
      ).bind(uid).first();

      return json({
        ok: true, token,
        is_new: !exist,
        user: {
          id: me.id, email: me.email, nickname: me.nickname,
          credits: me.credits, streak: me.streak, created_at: me.created_at,
          has_password: !!me.password_hash
        }
      }, 200, { 'Set-Cookie': sessionCookie(token) });
    }

    /* ---------- 以下需要登录 ---------- */
    const user = await currentUser(request, env);
    if (!user) return err('请先登录', 401);

    /* ---------- 设置 / 修改密码（需登录） ---------- */
    if (path === 'auth/set-password' && method === 'POST') {
      const { password, old_password } = await body(request);
      if (!password || String(password).length < 6) return err('密码至少 6 位');

      const me = await env.DB.prepare('SELECT password_hash, salt FROM users WHERE id = ?')
        .bind(user.id).first();

      if (me?.password_hash) {
        const okOld = await hashPassword(String(old_password || ''), me.salt);
        if (okOld !== me.password_hash) return err('原密码不正确');
      }

      const salt = randomToken(16);
      const hash = await hashPassword(String(password), salt);
      await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
        .bind(hash, salt, user.id).run();
      return json({ ok: true, has_password: true });
    }

    /* ---------- 提示词 ---------- */
    if (path === 'prompts' && method === 'GET') {
      await ensurePromptMeta(env);
      const { results } = await env.DB.prepare(
        `SELECT id, title, system_prompt, user_prompt, variables, model, version, updated_at,
                tags, folder, pinned
         FROM prompts WHERE user_id = ?
         ORDER BY pinned DESC, updated_at DESC LIMIT 200`
      ).bind(user.id).all();
      return json({ prompts: results });
    }

    if (path === 'prompts' && method === 'POST') {
      const p = await body(request);
      if (!p.title) return err('标题不能为空');
      await ensurePromptMeta(env);
      const r = await env.DB.prepare(
        `INSERT INTO prompts (user_id, title, system_prompt, user_prompt, variables, model, tags, folder, pinned)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(user.id, p.title, p.system_prompt || '', p.user_prompt || '',
             JSON.stringify(p.variables || {}), p.model || 'qwen-turbo',
             JSON.stringify(p.tags || []), p.folder || '', p.pinned ? 1 : 0).run();
      await checkBadges(env, user.id);
      return json({ ok: true, id: r.meta.last_row_id });
    }

    /* 只改元信息（标签 / 文件夹 / 置顶），不进版本历史、不动版本号 */
    if (path.startsWith('prompts/') && path.endsWith('/meta') && method === 'PUT') {
      const id = path.split('/')[1];
      const p = await body(request);
      await ensurePromptMeta(env);
      let tags = null, hasTags = false;
      if (Array.isArray(p.tags)) { tags = JSON.stringify(p.tags.slice(0, 10).map(String).slice(0, 10)); hasTags = true; }
      else if (typeof p.tags === 'string') { tags = p.tags; hasTags = true; }
      const res = await env.DB.prepare(
        `UPDATE prompts SET
           tags   = CASE WHEN ? THEN ? ELSE tags END,
           folder = CASE WHEN ? THEN ? ELSE folder END,
           pinned = CASE WHEN ? THEN ? ELSE pinned END
         WHERE id = ? AND user_id = ?`
      ).bind(
        hasTags ? 1 : 0, tags,
        p.folder === undefined ? 0 : 1, p.folder === undefined ? null : String(p.folder).slice(0, 20),
        p.pinned === undefined ? 0 : 1, p.pinned ? 1 : 0,
        id, user.id
      ).run();
      if (!res.meta?.changes) return err('提示词不存在', 404);
      return json({ ok: true });
    }

    if (path.startsWith('prompts/') && method === 'PUT') {
      const id = path.split('/')[1];
      const p = await body(request);

      // 版本历史：覆盖前先把旧内容留档（表在首次用到时幂等创建）
      await ensurePromptVersions(env);
      const old = await env.DB.prepare(
        'SELECT * FROM prompts WHERE id=? AND user_id=?'
      ).bind(id, user.id).first();
      if (old) {
        const hasChange =
          old.title !== p.title ||
          (old.system_prompt || '') !== (p.system_prompt || '') ||
          (old.user_prompt || '') !== (p.user_prompt || '') ||
          (old.variables || '') !== JSON.stringify(p.variables || {}) ||
          (old.model || '') !== (p.model || 'qwen-turbo');
        if (hasChange) {
          await env.DB.prepare(
            `INSERT INTO prompt_versions
               (prompt_id, version, title, system_prompt, user_prompt, variables, model)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(old.id, old.version, old.title, old.system_prompt || '', old.user_prompt || '',
                 old.variables || '{}', old.model || 'qwen-turbo').run();
          // 同一提示词最多留 30 个历史版本
          await env.DB.prepare(
            `DELETE FROM prompt_versions WHERE prompt_id = ? AND id NOT IN
               (SELECT id FROM prompt_versions WHERE prompt_id = ? ORDER BY id DESC LIMIT 30)`
          ).bind(old.id, old.id).run();
        }
      }

      await env.DB.prepare(
        `UPDATE prompts SET title=?, system_prompt=?, user_prompt=?, variables=?, model=?,
         version=version+1, updated_at=datetime('now') WHERE id=? AND user_id=?`
      ).bind(p.title, p.system_prompt || '', p.user_prompt || '',
             JSON.stringify(p.variables || {}), p.model || 'qwen-turbo', id, user.id).run();
      return json({ ok: true });
    }

    /* ---------- 自定义预设角色 ---------- */
    if (path === 'roles' && method === 'GET') {
      await ensureUserRoles(env);
      const { results } = await env.DB.prepare(
        'SELECT id, name, role_desc, system, created_at FROM user_roles WHERE user_id = ? ORDER BY id'
      ).bind(user.id).all();
      return json({ roles: results });
    }

    if (path === 'roles' && method === 'POST') {
      const { name, role_desc, system } = await body(request);
      const nm = String(name || '').trim();
      const sys = String(system || '').trim();
      if (!nm) return err('给角色起个名字');
      if (!sys) return err('角色提示词不能为空');
      if (nm.length > 12) return err('名字最多 12 个字');
      if (sys.length > 2000) return err('提示词最多 2000 字');
      await ensureUserRoles(env);
      const cnt = await env.DB.prepare(
        'SELECT COUNT(*) n FROM user_roles WHERE user_id = ?'
      ).bind(user.id).first();
      if ((cnt?.n || 0) >= 20) return err('自定义角色最多 20 个');
      const r = await env.DB.prepare(
        'INSERT INTO user_roles (user_id, name, role_desc, system) VALUES (?, ?, ?, ?)'
      ).bind(user.id, nm, String(role_desc || '').trim().slice(0, 30), sys).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path.startsWith('roles/') && method === 'PUT') {
      const id = Number(path.split('/')[1]) || 0;
      const { name, role_desc, system } = await body(request);
      const nm = String(name || '').trim();
      const sys = String(system || '').trim();
      if (!nm) return err('给角色起个名字');
      if (!sys) return err('角色提示词不能为空');
      await ensureUserRoles(env);
      const res = await env.DB.prepare(
        `UPDATE user_roles SET name=?, role_desc=?, system=? WHERE id=? AND user_id=?`
      ).bind(nm, String(role_desc || '').trim().slice(0, 30), sys, id, user.id).run();
      if (!res.meta?.changes) return err('角色不存在', 404);
      return json({ ok: true });
    }

    if (path.startsWith('roles/') && method === 'DELETE') {
      const id = Number(path.split('/')[1]) || 0;
      await ensureUserRoles(env);
      await env.DB.prepare('DELETE FROM user_roles WHERE id=? AND user_id=?')
        .bind(id, user.id).run();
      return json({ ok: true });
    }

    /* 版本历史：列表 */
    if (path.startsWith('prompts/') && path.endsWith('/versions') && method === 'GET') {
      const id = path.split('/')[1];
      await ensurePromptVersions(env);
      const own = await env.DB.prepare(
        'SELECT id FROM prompts WHERE id=? AND user_id=?'
      ).bind(id, user.id).first();
      if (!own) return err('提示词不存在', 404);
      const { results } = await env.DB.prepare(
        `SELECT id, version, title, system_prompt, user_prompt, variables, model, created_at
         FROM prompt_versions WHERE prompt_id = ? ORDER BY id DESC LIMIT 30`
      ).bind(id).all();
      return json({ versions: results });
    }

    /* 版本历史：恢复（把当前内容也留档，再覆盖为所选版本） */
    if (path.startsWith('prompts/') && path.endsWith('/restore') && method === 'POST') {
      const id = path.split('/')[1];
      const { version } = await body(request);
      await ensurePromptVersions(env);
      const own = await env.DB.prepare(
        'SELECT id FROM prompts WHERE id=? AND user_id=?'
      ).bind(id, user.id).first();
      if (!own) return err('提示词不存在', 404);
      const v = await env.DB.prepare(
        'SELECT * FROM prompt_versions WHERE prompt_id=? AND version=? ORDER BY id DESC LIMIT 1'
      ).bind(id, Number(version) || 0).first();
      if (!v) return err('该版本不存在', 404);

      const cur = await env.DB.prepare('SELECT * FROM prompts WHERE id=?').bind(id).first();
      if (cur) {
        await env.DB.prepare(
          `INSERT INTO prompt_versions
             (prompt_id, version, title, system_prompt, user_prompt, variables, model)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(cur.id, cur.version, cur.title, cur.system_prompt || '', cur.user_prompt || '',
               cur.variables || '{}', cur.model || 'qwen-turbo').run();
      }
      await env.DB.prepare(
        `UPDATE prompts SET title=?, system_prompt=?, user_prompt=?, variables=?, model=?,
         version=version+1, updated_at=datetime('now') WHERE id=?`
      ).bind(v.title, v.system_prompt || '', v.user_prompt || '', v.variables || '{}',
             v.model || 'qwen-turbo', id).run();
      return json({ ok: true });
    }

    if (path.startsWith('prompts/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM prompts WHERE id=? AND user_id=?').bind(id, user.id).run();
      await ensurePromptVersions(env);
      await env.DB.prepare('DELETE FROM prompt_versions WHERE prompt_id=?').bind(id).run();
      return json({ ok: true });
    }

    /* ---------- 用户自带 AI 密钥 ---------- */
    if (path === 'keys' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT id, provider, label, key_hint, base_url, model, is_default, status, last_error, updated_at
         FROM user_keys WHERE user_id = ? ORDER BY is_default DESC, id DESC`
      ).bind(user.id).all();
      return json({ keys: results, providers: providerOptions() });
    }

    if (path === 'keys' && method === 'POST') {
      const { provider, api_key, label, base_url, model } = await body(request);
      if (!PROVIDERS[provider]) return err('未知的服务商');
      if (!api_key || String(api_key).length < 8) return err('请填写有效的 API Key');

      const { enc, iv } = await encryptSecret(env, String(api_key));
      const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM user_keys WHERE user_id = ?')
        .bind(user.id).first();
      const m = model || defaultModel(provider) || 'gpt-4o-mini';

      const r = await env.DB.prepare(
        `INSERT INTO user_keys (user_id, provider, label, key_enc, key_iv, key_hint, base_url, model, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(user.id, provider, label || PROVIDERS[provider].name, enc, iv,
             maskKey(api_key), String(base_url || '').trim(), m, (cnt?.n || 0) === 0 ? 1 : 0).run();

      return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path === 'keys/test' && method === 'POST') {
      const { id, provider, api_key, base_url, model } = await body(request);
      let p = provider, key = api_key, url = String(base_url || '').trim(), m = model;

      if (id) {
        const row = await env.DB.prepare('SELECT * FROM user_keys WHERE id = ? AND user_id = ?')
          .bind(id, user.id).first();
        if (!row) return err('密钥不存在', 404);
        p = row.provider;
        key = await decryptSecret(env, row.key_enc, row.key_iv);
        url = row.base_url || '';
        m = row.model;
      }
      if (!key) return err('缺少密钥');

      const endpoint = resolveEndpoint(p, url);
      if (!endpoint) return err(p === 'custom' ? '请先填写 Base URL' : '服务商地址未配置');

      const testModel = m || defaultModel(p) || 'qwen-turbo';
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: testModel, messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 5, stream: false
          })
        });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
        if (id) {
          await env.DB.prepare("UPDATE user_keys SET status='ok', last_error=NULL, updated_at=datetime('now') WHERE id=?")
            .bind(id).run();
        }
        return json({ ok: true, model: testModel });
      } catch (e) {
        const m2 = String(e?.message || e).slice(0, 200);
        if (id) {
          await env.DB.prepare("UPDATE user_keys SET status='error', last_error=?, updated_at=datetime('now') WHERE id=?")
            .bind(m2, id).run();
        }
        return fail('连接失败：' + m2);
      }
    }

    if (path === 'keys/default' && method === 'POST') {
      const { id } = await body(request);
      // 先确认密钥存在：否则会把现有默认清空却设不上新的，导致 chat / 批量测试找不到密钥
      const row = await env.DB.prepare('SELECT id FROM user_keys WHERE id = ? AND user_id = ?')
        .bind(id, user.id).first();
      if (!row) return err('密钥不存在', 404);
      await env.DB.prepare('UPDATE user_keys SET is_default = 0 WHERE user_id = ?').bind(user.id).run();
      await env.DB.prepare('UPDATE user_keys SET is_default = 1 WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (path.startsWith('keys/') && method === 'PUT') {
      const id = path.split('/')[1];
      const { model, label } = await body(request);
      await env.DB.prepare(
        `UPDATE user_keys SET model = COALESCE(?, model), label = COALESCE(?, label),
         updated_at = datetime('now') WHERE id = ? AND user_id = ?`
      ).bind(model || null, label || null, id, user.id).run();
      return json({ ok: true });
    }

    if (path.startsWith('keys/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM user_keys WHERE id = ? AND user_id = ?')
        .bind(id, user.id).run();
      // 保证始终有一个默认密钥（如果还有的话）
      const left = await env.DB.prepare(
        'SELECT id FROM user_keys WHERE user_id = ? ORDER BY id LIMIT 1'
      ).bind(user.id).first();
      if (left) {
        await env.DB.prepare('UPDATE user_keys SET is_default = 1 WHERE id = ?').bind(left.id).run();
      }
      return json({ ok: true });
    }

    /* ---------- AI 对话 / 调试 ---------- */
    if (path === 'chat' && method === 'POST') {
      const { messages, model, temperature = 0.7, stream = true } = await body(request);
      if (!Array.isArray(messages) || !messages.length) return err('messages 不能为空');

      // 优先用用户自己的密钥，没有才回退到服务端内置密钥
      let apiKey = env[AI_KEY_VAR];
      let endpoint = AI_ENDPOINT;
      let useModel = model || 'qwen-turbo';

      const krow = await env.DB.prepare(
        'SELECT * FROM user_keys WHERE user_id = ? AND is_default = 1 ORDER BY id DESC LIMIT 1'
      ).bind(user.id).first();

      if (krow) {
        apiKey = await decryptSecret(env, krow.key_enc, krow.key_iv);
        endpoint = resolveEndpoint(krow.provider, krow.base_url);
        if (!model) useModel = krow.model || defaultModel(krow.provider) || 'qwen-turbo';
        if (!endpoint) return err('默认密钥缺少 Base URL，请到 API 密钥管理里补全', 400);
      }

      if (!apiKey) {
        return err('还没有可用的 AI 密钥：去「我的 → API 密钥管理」添加你自己的，或让管理员配置服务端密钥', 400);
      }

      /* OpenAI 兼容接口在流式模式下默认不回传 usage，必须显式声明
         stream_options.include_usage，否则「累计 Token」永远是 0。 */
      const mkPayload = (withUsage) => {
        const p = { model: useModel, messages, temperature, stream };
        if (withUsage) p.stream_options = { include_usage: true };
        return p;
      };
      const callUpstream = (payload) => fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let upstream = await callUpstream(mkPayload(stream));
      // 少数上游不认识 stream_options 会返回 400，退一档重发，别把正常调用打挂
      if (stream && !upstream.ok && upstream.status === 400) {
        await upstream.text().catch(() => {});
        upstream = await callUpstream(mkPayload(false));
      }

      if (!upstream.ok) {
        const text = await upstream.text();
        await logUsage(env, user.id, useModel, null, 'error');
        return fail(`模型调用失败：${text.slice(0, 200)}`);
      }

      if (stream) {
        // 分流：一路直接返回前端，一路后台统计 token
        const [toClient, toMeter] = upstream.body.tee();
        ctx.waitUntil(readStreamUsage(toMeter).then(u => logUsage(env, user.id, useModel, u)));
        return new Response(toClient, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no'
          }
        });
      }

      const data = await upstream.json();
      await logUsage(env, user.id, useModel, data.usage);
      return json(data);
    }

    /* ---------- 乐园 ---------- */
    if (path === 'playground/gacha' && method === 'POST') {
      const COST = 10;
      if (user.credits < COST) return err('灵感值不足，先去签到或写提示词攒一攒');

      const r = Math.random();
      const pool = r < 0.62 ? GACHA_POOL.filter(x => x.rarity === '普通')
        : r < 0.87 ? GACHA_POOL.filter(x => x.rarity === '稀有')
        : r < 0.97 ? GACHA_POOL.filter(x => x.rarity === '史诗')
        : GACHA_POOL.filter(x => x.rarity === '传说');
      const prize = pool[Math.floor(Math.random() * pool.length)];

      const credits = await addCredits(env, user.id, -COST, '扭蛋抽奖');
      await env.DB.prepare('INSERT INTO gacha_log (user_id, rarity, prize) VALUES (?, ?, ?)')
        .bind(user.id, prize.rarity, prize.text).run();
      await checkBadges(env, user.id);

      return json({ ok: true, rarity: prize.rarity, prize: prize.text, credits });
    }

    if (path === 'playground/gacha' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT rarity, prize, created_at FROM gacha_log
         WHERE user_id = ? ORDER BY id DESC LIMIT 20`
      ).bind(user.id).all();
      return json({ logs: results });
    }

    if (path === 'playground/bingo' && method === 'GET') {
      const month = await monthKey(env, user.id);
      const row = await env.DB.prepare(
        'SELECT cells FROM bingo_state WHERE user_id = ? AND month = ?'
      ).bind(user.id, month).first();
      return json({ month, cells: row ? JSON.parse(row.cells) : null });
    }

    if (path === 'playground/bingo' && method === 'PUT') {
      const { cells } = await body(request);
      const month = await monthKey(env, user.id);
      await env.DB.prepare(
        `INSERT INTO bingo_state (user_id, month, cells, updated_at) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, month) DO UPDATE SET cells = excluded.cells, updated_at = datetime('now')`
      ).bind(user.id, month, JSON.stringify(cells || [])).run();
      await checkBadges(env, user.id);
      return json({ ok: true });
    }

    if (path === 'playground/arena' && method === 'POST') {
      const raw = await body(request);
      const my = Number(raw.my_score), ai = Number(raw.ai_score);
      if (!Number.isFinite(my) || !Number.isFinite(ai) || my < 0 || ai < 0 || my > 9999 || ai > 9999) {
        return err('比分不合法');
      }
      const my_score = Math.round(my), ai_score = Math.round(ai);
      await env.DB.prepare('INSERT INTO arena_log (user_id, my_score, ai_score) VALUES (?, ?, ?)')
        .bind(user.id, my_score, ai_score).run();

      // 比分由客户端上报，若不限量发奖可直接无限刷灵感值：每日最多 5 场胜利计奖
      let reward = 0;
      if (my_score > ai_score) {
        const w = await env.DB.prepare(
          `SELECT COUNT(*) n FROM arena_log
           WHERE user_id = ? AND my_score > ai_score AND created_at >= date('now')`
        ).bind(user.id).first();
        if ((w?.n || 0) <= ARENA_DAILY_REWARD_WINS) {
          reward = 20;
          await addCredits(env, user.id, reward, '竞技场获胜');
        }
      }
      await checkBadges(env, user.id);
      const row = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(user.id).first();
      return json({ ok: true, credits: row.credits, reward });
    }

    /* ---------- 竞技场：排行榜 / 历史 ---------- */
    if (path === 'playground/arena/board' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT u.nickname,
                COUNT(a.id) matches,
                SUM(CASE WHEN a.my_score > a.ai_score THEN 1 ELSE 0 END) wins,
                COALESCE(SUM(CASE WHEN a.my_score > a.ai_score THEN 30
                                  WHEN a.my_score = a.ai_score THEN 10 ELSE 5 END), 0) points
         FROM arena_log a JOIN users u ON u.id = a.user_id
         WHERE a.created_at >= datetime('now', '-7 days')
         GROUP BY u.id ORDER BY points DESC LIMIT 10`
      ).all();
      const mine = await env.DB.prepare(
        `SELECT COUNT(*) matches,
                SUM(CASE WHEN my_score > ai_score THEN 1 ELSE 0 END) wins,
                COALESCE(SUM(CASE WHEN my_score > ai_score THEN 30
                                  WHEN my_score = ai_score THEN 10 ELSE 5 END), 0) points
         FROM arena_log WHERE user_id = ? AND created_at >= datetime('now', '-7 days')`
      ).bind(user.id).first();
      return json({ board: results, mine });
    }

    if (path === 'playground/arena/history' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT my_score, ai_score, created_at FROM arena_log
         WHERE user_id = ? ORDER BY id DESC LIMIT 20`
      ).bind(user.id).all();
      return json({ logs: results });
    }

    /* ---------- 沙雕生成器 ---------- */
    if (path === 'silly' && method === 'GET') {
      const pick = async (slot) => {
        const { results } = await env.DB.prepare(
          'SELECT text FROM silly_words WHERE slot = ? ORDER BY RANDOM() LIMIT 1'
        ).bind(slot).all();
        return results[0]?.text || '';
      };
      const slots = [await pick(0), await pick(1), await pick(2)];
      const { results: hot } = await env.DB.prepare(
        `SELECT p.id, p.body, p.likes, u.nickname
         FROM silly_posts p JOIN users u ON u.id = p.user_id
         ORDER BY p.likes DESC, p.id DESC LIMIT 10`
      ).all();
      const { results: mine } = await env.DB.prepare(
        'SELECT id, body, likes, created_at FROM silly_posts WHERE user_id = ? ORDER BY id DESC LIMIT 20'
      ).bind(user.id).all();
      return json({ slots, hot, mine });
    }

    if (path === 'silly' && method === 'POST') {
      const { body: text } = await body(request);
      if (!text || String(text).length < 4) return err('内容太短了');
      const r = await env.DB.prepare('INSERT INTO silly_posts (user_id, body) VALUES (?, ?)')
        .bind(user.id, String(text).slice(0, 300)).run();
      await checkBadges(env, user.id);
      return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path === 'silly/like' && method === 'POST') {
      const { id } = await body(request);
      if (!await env.DB.prepare('SELECT 1 FROM silly_posts WHERE id = ?').bind(id).first()) {
        return err('内容不存在', 404);
      }
      const dup = await env.DB.prepare('SELECT 1 FROM silly_likes WHERE user_id = ? AND post_id = ?')
        .bind(user.id, id).first();
      if (dup) return err('已经点过赞了');
      await env.DB.prepare('INSERT INTO silly_likes (user_id, post_id) VALUES (?, ?)').bind(user.id, id).run();
      await env.DB.prepare('UPDATE silly_posts SET likes = likes + 1 WHERE id = ?').bind(id).run();
      const row = await env.DB.prepare('SELECT likes FROM silly_posts WHERE id = ?').bind(id).first();
      return json({ ok: true, likes: row?.likes ?? 0 });
    }

    /* ---------- 成就徽章 ---------- */
    if (path === 'badges' && method === 'GET') {
      const [{ results: defs }, { results: owned }] = await Promise.all([
        env.DB.prepare('SELECT * FROM badge_defs ORDER BY legendary, id').all(),
        env.DB.prepare('SELECT badge_id, created_at FROM user_badges WHERE user_id = ?').bind(user.id).all()
      ]);
      const newOnes = await checkBadges(env, user.id);
      const ownedMap = Object.fromEntries(owned.map(o => [o.badge_id, o.created_at]));
      const list = defs.map(d => ({ ...d, unlocked: !!ownedMap[d.id], at: ownedMap[d.id] || null }));
      return json({
        badges: list,
        total: defs.length,
        unlocked: list.filter(b => b.unlocked).length,
        new_unlocked: newOnes
      });
    }

    /* ---------- 每日锦鲤 / 打卡 ---------- */
    if (path === 'koi' && method === 'GET') {
      const day = (await env.DB.prepare("SELECT date('now') d").first()).d;
      let draw = await env.DB.prepare('SELECT card_id FROM koi_draws WHERE user_id = ? AND day = ?')
        .bind(user.id, day).first();
      let isNew = false;
      if (!draw) {
        const card = await env.DB.prepare('SELECT * FROM koi_cards ORDER BY RANDOM() LIMIT 1').first();
        if (!card) return fail('锦鲤卡池还没准备好');
        await env.DB.prepare('INSERT INTO koi_draws (user_id, day, card_id) VALUES (?, ?, ?)')
          .bind(user.id, day, card.id).run();
        draw = { card_id: card.id };
        isNew = true;
        await addCredits(env, user.id, 5, '翻开今日锦鲤');
      }
      const card = await env.DB.prepare('SELECT * FROM koi_cards WHERE id = ?').bind(draw.card_id).first();
      const { results: calendar } = await env.DB.prepare(
        `SELECT day, makeup FROM checkins WHERE user_id = ?
         AND day >= date('now', '-29 days') ORDER BY day`
      ).bind(user.id).all();
      const me = await env.DB.prepare('SELECT credits, streak FROM users WHERE id = ?').bind(user.id).first();
      return json({ card, isNew, day, calendar, credits: me.credits, streak: me.streak });
    }

    if (path === 'checkin' && method === 'POST') {
      const day = (await env.DB.prepare("SELECT date('now') d").first()).d;
      const ex = await env.DB.prepare('SELECT id FROM checkins WHERE user_id = ? AND day = ?')
        .bind(user.id, day).first();
      if (ex) return fail('今天已经打过卡了，明天再来');
      await env.DB.prepare('INSERT INTO checkins (user_id, day) VALUES (?, ?)').bind(user.id, day).run();
      await addCredits(env, user.id, 10, '每日打卡');
      const streak = await recalcStreak(env, user.id);
      await checkBadges(env, user.id);
      return json({ ok: true, streak });
    }

    if (path === 'koi/makeup' && method === 'POST') {
      const { day } = await body(request);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return err('日期格式不对');
      const today = (await env.DB.prepare("SELECT date('now') d").first()).d;
      if (String(day) >= today) return err('今天及以后的日期请直接打卡，不用补签');
      const floor = (await env.DB.prepare("SELECT date('now', '-29 days') d").first()).d;
      if (String(day) < floor) return err('只能补签最近 30 天内的日期');
      const ex = await env.DB.prepare('SELECT id FROM checkins WHERE user_id = ? AND day = ?')
        .bind(user.id, day).first();
      if (ex) return fail('这天已经签过了');
      const me = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(user.id).first();
      if ((me.credits || 0) < 20) return fail('灵感值不足 20，补签需要 20');
      await env.DB.prepare('INSERT INTO checkins (user_id, day, makeup) VALUES (?, ?, 1)')
        .bind(user.id, day).run();
      await addCredits(env, user.id, -20, '补签 ' + day);
      const streak = await recalcStreak(env, user.id);
      return json({ ok: true, streak });
    }

    /* ---------- 翻车现场墙 ---------- */
    if (path === 'fails' && method === 'GET') {
      const sort = new URL(request.url).searchParams.get('sort') || 'new';
      const order = sort === 'hot_week'
        ? 'f.likes DESC, f.id DESC'
        : sort === 'hot' ? 'f.likes DESC, f.id DESC' : 'f.id DESC';
      const where = sort === 'hot_week' ? "AND f.created_at >= datetime('now', '-7 days')" : '';
      const { results } = await env.DB.prepare(
        `SELECT f.id, f.prompt, f.result, f.remark, f.likes, f.created_at, u.nickname
         FROM fail_posts f JOIN users u ON u.id = f.user_id
         WHERE 1=1 ${where} ORDER BY ${order} LIMIT 30`
      ).all();
      const { results: liked } = await env.DB.prepare(
        'SELECT post_id FROM fail_likes WHERE user_id = ?'
      ).bind(user.id).all();
      return json({ posts: results, liked: liked.map(x => x.post_id) });
    }

    if (path === 'fails' && method === 'POST') {
      const { prompt: p, result, remark } = await body(request);
      if (!p || !result) return err('Prompt 和翻车结果都要填');
      await env.DB.prepare(
        'INSERT INTO fail_posts (user_id, prompt, result, remark) VALUES (?, ?, ?, ?)'
      ).bind(user.id, String(p).slice(0, 200), String(result).slice(0, 500),
             String(remark || '').slice(0, 50)).run();
      await checkBadges(env, user.id);
      return json({ ok: true });
    }

    if (path === 'fails/like' && method === 'POST') {
      const { id } = await body(request);
      if (!await env.DB.prepare('SELECT 1 FROM fail_posts WHERE id = ?').bind(id).first()) {
        return err('内容不存在', 404);
      }
      const dup = await env.DB.prepare('SELECT 1 FROM fail_likes WHERE user_id = ? AND post_id = ?')
        .bind(user.id, id).first();
      if (dup) return err('已经点过赞了');
      await env.DB.prepare('INSERT INTO fail_likes (user_id, post_id) VALUES (?, ?)').bind(user.id, id).run();
      await env.DB.prepare('UPDATE fail_posts SET likes = likes + 1 WHERE id = ?').bind(id).run();
      const row = await env.DB.prepare('SELECT likes FROM fail_posts WHERE id = ?').bind(id).first();
      await checkBadges(env, user.id);
      return json({ ok: true, likes: row?.likes ?? 0 });
    }

    /* ---------- 社区广场 ---------- */
    if (path === 'community' && method === 'GET') {
      const sp = new URL(request.url).searchParams;
      const sort = sp.get('sort') || 'new';
      const kw = (sp.get('q') || '').trim();
      const order = sort === 'hot' ? 'c.likes DESC, c.id DESC' : 'c.id DESC';
      const like = kw ? `AND (c.title LIKE '%${kw.replace(/'/g, '')}%' OR c.content LIKE '%${kw.replace(/'/g, '')}%')` : '';
      const { results } = await env.DB.prepare(
        `SELECT c.id, c.title, c.content, c.tags, c.effect, c.likes, c.favs, c.created_at, u.nickname
         FROM community_posts c JOIN users u ON u.id = c.user_id
         WHERE 1=1 ${like} ORDER BY ${order} LIMIT 30`
      ).all();
      const [{ results: liked }, { results: faved }] = await Promise.all([
        env.DB.prepare('SELECT post_id FROM community_likes WHERE user_id = ?').bind(user.id).all(),
        env.DB.prepare('SELECT post_id FROM community_favs WHERE user_id = ?').bind(user.id).all()
      ]);
      return json({
        posts: results,
        liked: liked.map(x => x.post_id),
        faved: faved.map(x => x.post_id)
      });
    }

    if (path === 'community' && method === 'POST') {
      const { title, content, tags, effect } = await body(request);
      if (!title || !content) return err('标题和内容都要填');
      const r = await env.DB.prepare(
        'INSERT INTO community_posts (user_id, title, content, tags, effect) VALUES (?, ?, ?, ?, ?)'
      ).bind(user.id, String(title).slice(0, 60), String(content).slice(0, 4000),
             String(tags || '').slice(0, 80), String(effect || '').slice(0, 300)).run();
      await addCredits(env, user.id, 30, '发布社区作品');
      await checkBadges(env, user.id);
      return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path === 'community/like' && method === 'POST') {
      const { id } = await body(request);
      if (!await env.DB.prepare('SELECT 1 FROM community_posts WHERE id = ?').bind(id).first()) {
        return err('作品不存在', 404);
      }
      const dup = await env.DB.prepare('SELECT 1 FROM community_likes WHERE user_id = ? AND post_id = ?')
        .bind(user.id, id).first();
      if (dup) return err('已经点过赞了');
      await env.DB.prepare('INSERT INTO community_likes (user_id, post_id) VALUES (?, ?)').bind(user.id, id).run();
      await env.DB.prepare('UPDATE community_posts SET likes = likes + 1 WHERE id = ?').bind(id).run();
      const row = await env.DB.prepare('SELECT likes FROM community_posts WHERE id = ?').bind(id).first();
      await checkBadges(env, user.id);
      return json({ ok: true, likes: row?.likes ?? 0 });
    }

    if (path === 'community/fav' && method === 'POST') {
      const { id } = await body(request);
      if (!await env.DB.prepare('SELECT 1 FROM community_posts WHERE id = ?').bind(id).first()) {
        return err('作品不存在', 404);
      }
      const dup = await env.DB.prepare('SELECT 1 FROM community_favs WHERE user_id = ? AND post_id = ?')
        .bind(user.id, id).first();
      if (dup) {
        await env.DB.prepare('DELETE FROM community_favs WHERE user_id = ? AND post_id = ?').bind(user.id, id).run();
        await env.DB.prepare('UPDATE community_posts SET favs = MAX(0, favs - 1) WHERE id = ?').bind(id).run();
        const r2 = await env.DB.prepare('SELECT favs FROM community_posts WHERE id = ?').bind(id).first();
        return json({ ok: true, faved: false, favs: r2?.favs ?? 0 });
      }
      await env.DB.prepare('INSERT INTO community_favs (user_id, post_id) VALUES (?, ?)').bind(user.id, id).run();
      await env.DB.prepare('UPDATE community_posts SET favs = favs + 1 WHERE id = ?').bind(id).run();
      const row = await env.DB.prepare('SELECT favs FROM community_posts WHERE id = ?').bind(id).first();
      return json({ ok: true, faved: true, favs: row?.favs ?? 0 });
    }

    if (path === 'community/comments' && method === 'GET') {
      const id = new URL(request.url).searchParams.get('post_id');
      const { results } = await env.DB.prepare(
        `SELECT c.id, c.content, c.created_at, u.nickname
         FROM community_comments c JOIN users u ON u.id = c.user_id
         WHERE c.post_id = ? ORDER BY c.id DESC LIMIT 50`
      ).bind(id).all();
      return json({ comments: results });
    }

    if (path === 'community/comments' && method === 'POST') {
      const { post_id, content } = await body(request);
      if (!post_id || !content) return err('评论内容不能为空');
      if (!await env.DB.prepare('SELECT 1 FROM community_posts WHERE id = ?').bind(post_id).first()) {
        return err('作品不存在', 404);
      }
      await env.DB.prepare(
        'INSERT INTO community_comments (post_id, user_id, content) VALUES (?, ?, ?)'
      ).bind(post_id, user.id, String(content).slice(0, 200)).run();
      return json({ ok: true });
    }

    /* ---------- 批量测试 ---------- */
    if (path === 'batch' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, name, model, created_at FROM batch_runs WHERE user_id = ? ORDER BY id DESC LIMIT 10'
      ).bind(user.id).all();
      return json({ runs: results });
    }

    if (path === 'batch/run' && method === 'POST') {
      const { name, versions, variables, model } = await body(request);
      if (!Array.isArray(versions) || !versions.length) return err('至少要有一个提示词版本');
      const varNames = Object.keys(variables || {});
      let combos = [{}];
      for (const n of varNames) {
        const vals = (variables[n] || []).filter(Boolean);
        if (!vals.length) continue;
        const next = [];
        for (const c of combos) for (const v of vals) next.push({ ...c, [n]: v });
        combos = next;
      }
      if (!combos.length) combos = [{}];

      // 控制调用量：Workers 有 CPU / 挂钟时间限制
      const MAX = 8;
      const jobs = [];
      for (const v of versions.slice(0, 3)) {
        for (const c of combos.slice(0, 4)) {
          if (jobs.length >= MAX) break;
          jobs.push({ version: v, vars: c });
        }
      }

      const picked = await pickModel(env, user, model);
      if (!picked) return fail('还没有可用的 AI 密钥，先去「我的 → API 密钥管理」添加一个');

      const runRes = await env.DB.prepare(
        'INSERT INTO batch_runs (user_id, name, model) VALUES (?, ?, ?)'
      ).bind(user.id, String(name || '批量测试').slice(0, 40), picked.model).run();
      const runId = runRes.meta.last_row_id;

      const fill = (tpl, vars) => String(tpl || '').replace(/\$\{\s*([^}]+?)\s*\}/g,
        (_, k) => vars[k] ?? `{${k}}`);

      const one = async (job) => {
        const t0 = Date.now();
        const sys = fill(job.version.system, job.vars);
        const usr = fill(job.version.user, job.vars);
        const messages = [];
        if (sys) messages.push({ role: 'system', content: sys });
        messages.push({ role: 'user', content: usr });
        try {
          const res = await fetch(picked.endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${picked.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: picked.model, messages, temperature: 0.7, stream: false })
          });
          if (!res.ok) throw new Error((await res.text()).slice(0, 120));
          const data = await res.json();
          const out = data.choices?.[0]?.message?.content || '';
          const usage = data.usage || null;
          await logUsage(env, user.id, picked.model, usage);
          const score = await judge(env, picked, job, out);
          await env.DB.prepare(
            `INSERT INTO batch_results (run_id, version, vars, output, score, latency_ms)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(runId, job.version.label || 'V1', JSON.stringify(job.vars),
                 out.slice(0, 4000), score, Date.now() - t0).run();
          return { version: job.version.label, vars: job.vars, output: out, score, ok: true };
        } catch (e) {
          await env.DB.prepare(
            `INSERT INTO batch_results (run_id, version, vars, output, score, latency_ms)
             VALUES (?, ?, ?, ?, NULL, ?)`
          ).bind(runId, job.version.label || 'V1', JSON.stringify(job.vars),
                 '调用失败：' + String(e?.message || e).slice(0, 200), Date.now() - t0).run();
          return { version: job.version.label, vars: job.vars, output: '', score: null, ok: false };
        }
      };

      const results = await Promise.all(jobs.map(one));
      return json({ ok: true, run_id: runId, model: picked.model, results });
    }

    /* ---------- 用户偏好（云端同步） ---------- */
    if (path === 'settings' && method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first();
      return json({
        settings: row || {
          theme: 'dark', font_size: 'medium', default_model: 'qwen-turbo',
          language: 'zh-CN', notify: 1
        }
      });
    }

    if (path === 'settings' && method === 'PUT') {
      const d = await body(request);
      await env.DB.prepare(
        `INSERT INTO user_settings (user_id, theme, font_size, default_model, language, notify, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           theme = COALESCE(excluded.theme, theme),
           font_size = COALESCE(excluded.font_size, font_size),
           default_model = COALESCE(excluded.default_model, default_model),
           language = COALESCE(excluded.language, language),
           notify = COALESCE(excluded.notify, notify),
           updated_at = datetime('now')`
      ).bind(user.id, d.theme || null, d.font_size || null, d.default_model || null,
             d.language || null, d.notify == null ? null : (d.notify ? 1 : 0)).run();
      return json({ ok: true });
    }

    /* ---------- 灵感值流水 ---------- */
    if (path === 'credits' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT amount, reason, created_at FROM credits_log WHERE user_id = ? ORDER BY id DESC LIMIT 50'
      ).bind(user.id).all();
      const me = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(user.id).first();
      return json({ balance: me.credits, logs: results });
    }

    /* ---------- 数据导出 ---------- */
    if (path === 'export' && method === 'GET') {
      const [prompts, usage, gacha, silly, fails, comm, badges] = await Promise.all([
        env.DB.prepare('SELECT title, system_prompt, user_prompt, variables, model, created_at FROM prompts WHERE user_id = ?').bind(user.id).all(),
        env.DB.prepare('SELECT model, prompt_tokens, completion_tokens, created_at FROM usage WHERE user_id = ? ORDER BY id DESC LIMIT 500').bind(user.id).all(),
        env.DB.prepare('SELECT rarity, prize, created_at FROM gacha_log WHERE user_id = ?').bind(user.id).all(),
        env.DB.prepare('SELECT body, likes, created_at FROM silly_posts WHERE user_id = ?').bind(user.id).all(),
        env.DB.prepare('SELECT prompt, result, remark, created_at FROM fail_posts WHERE user_id = ?').bind(user.id).all(),
        env.DB.prepare('SELECT title, content, tags, likes, created_at FROM community_posts WHERE user_id = ?').bind(user.id).all(),
        env.DB.prepare('SELECT badge_id, created_at FROM user_badges WHERE user_id = ?').bind(user.id).all()
      ]);
      return json({
        exported_at: new Date().toISOString(),
        user: { email: user.email, nickname: user.nickname, credits: user.credits },
        prompts: prompts.results, usage: usage.results, gacha: gacha.results,
        silly: silly.results, fails: fails.results, community: comm.results,
        badges: badges.results
      });
    }

    /* ---------- 统计 ---------- */
    if (path === 'stats' && method === 'GET') {
      const [daily, models, totals, prompts, recent] = await Promise.all([
        env.DB.prepare(
          `SELECT date(created_at) day, COUNT(*) calls,
                  COALESCE(SUM(prompt_tokens + completion_tokens), 0) tokens
           FROM usage WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
           GROUP BY day ORDER BY day`
        ).bind(user.id).all(),
        env.DB.prepare(
          'SELECT model, COUNT(*) calls FROM usage WHERE user_id = ? GROUP BY model'
        ).bind(user.id).all(),
        env.DB.prepare(
          `SELECT COUNT(*) calls, COALESCE(SUM(prompt_tokens), 0) p_tokens,
                  COALESCE(SUM(completion_tokens), 0) c_tokens
           FROM usage WHERE user_id = ?`
        ).bind(user.id).first(),
        env.DB.prepare('SELECT COUNT(*) n FROM prompts WHERE user_id = ?').bind(user.id).first(),
        env.DB.prepare(
          `SELECT created_at, model, prompt_tokens, completion_tokens, status
           FROM usage WHERE user_id = ? ORDER BY id DESC LIMIT 8`
        ).bind(user.id).all()
      ]);

      return json({
        daily: daily.results,
        models: models.results,
        totals,
        prompt_count: prompts.n,
        recent: recent.results,
        credits: user.credits
      });
    }

    return err('接口不存在：/api/' + path, 404);
  } catch (e) {
    return fail('服务端异常：' + (e?.message || String(e)));
  }
}

/* ---------- 工具 ---------- */
async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

const cors = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

async function monthKey(env, userId) {
  const row = await env.DB.prepare("SELECT strftime('%Y-%m', 'now') m").first();
  return row.m;
}

/* ---------- 灵感值（积分）账务 ---------- */
async function addCredits(env, userId, amount, reason) {
  await env.DB.prepare(
    'UPDATE users SET credits = MAX(0, credits + ?) WHERE id = ?'
  ).bind(amount, userId).run();
  await env.DB.prepare(
    'INSERT INTO credits_log (user_id, amount, reason) VALUES (?, ?, ?)'
  ).bind(userId, amount, reason || '').run();
  const row = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(userId).first();
  return row?.credits ?? 0;
}

/* ---------- 连续打卡天数重算 ---------- */
async function recalcStreak(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT day FROM checkins WHERE user_id = ? ORDER BY day DESC LIMIT 400"
  ).bind(userId).all();
  const set = new Set(results.map(r => r.day));
  let streak = 0;
  const d = new Date();
  // 今天没签不算断，从昨天开始回溯也能接上
  if (!set.has(fmtDay(d))) d.setDate(d.getDate() - 1);
  for (;;) {
    const key = fmtDay(d);
    if (!set.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  await env.DB.prepare('UPDATE users SET streak = ? WHERE id = ?').bind(streak, userId).run();
  return streak;
}

function fmtDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ---------- 成就徽章：解锁条件全部在服务端判定 ---------- */
async function checkBadges(env, userId) {
  const q = async (sql, ...bind) => (await env.DB.prepare(sql).bind(...bind).first());
  const cnt = async (sql, ...bind) => ((await q(sql, ...bind))?.n) || 0;

  const stats = {
    prompts:    await cnt('SELECT COUNT(*) n FROM prompts WHERE user_id = ?', userId),
    calls:      await cnt('SELECT COUNT(*) n FROM usage WHERE user_id = ?', userId),
    gacha:      await cnt('SELECT COUNT(*) n FROM gacha_log WHERE user_id = ?', userId),
    gacha_leg:  await cnt("SELECT COUNT(*) n FROM gacha_log WHERE user_id = ? AND rarity = '传说'", userId),
    silly:      await cnt('SELECT COUNT(*) n FROM silly_posts WHERE user_id = ?', userId),
    koi:        await cnt('SELECT COUNT(*) n FROM koi_draws WHERE user_id = ?', userId),
    fails:      await cnt('SELECT COUNT(*) n FROM fail_posts WHERE user_id = ?', userId),
    community:  await cnt('SELECT COUNT(*) n FROM community_posts WHERE user_id = ?', userId),
    comm_likes: await cnt('SELECT COALESCE(SUM(likes), 0) n FROM community_posts WHERE user_id = ?', userId),
    wins:       await cnt('SELECT COUNT(*) n FROM arena_log WHERE user_id = ? AND my_score > ai_score', userId),
    keys:       await cnt('SELECT COUNT(*) n FROM user_keys WHERE user_id = ?', userId),
    streak:     (await q('SELECT streak FROM users WHERE id = ?', userId))?.streak || 0
  };

  // Bingo 连线数
  let bingoLines = 0, bingoFull = false;
  try {
    const month = (await q("SELECT strftime('%Y-%m', 'now') m")).m;
    const bs = await q('SELECT cells FROM bingo_state WHERE user_id = ? AND month = ?', userId, month);
    if (bs?.cells) {
      const cells = JSON.parse(bs.cells);
      if (Array.isArray(cells) && cells.length === 25) {
        const on = cells.map(c => !!c);
        const lines = [];
        for (let r = 0; r < 5; r++) lines.push([0,1,2,3,4].map(c => r * 5 + c));
        for (let c = 0; c < 5; c++) lines.push([0,1,2,3,4].map(r => r * 5 + c));
        lines.push([0, 6, 12, 18, 24]);
        lines.push([4, 8, 12, 16, 20]);
        bingoLines = lines.filter(l => l.every(i => on[i])).length;
        bingoFull = on.every(Boolean);
      }
    }
  } catch { /* bingo 状态不存在时忽略 */ }

  // 竞技场赛季排名
  let arenaRank = 999;
  try {
    const { results: board } = await env.DB.prepare(
      `SELECT a.user_id,
              COALESCE(SUM(CASE WHEN a.my_score > a.ai_score THEN 30
                                WHEN a.my_score = a.ai_score THEN 10 ELSE 5 END), 0) points
       FROM arena_log a WHERE a.created_at >= datetime('now', '-7 days')
       GROUP BY a.user_id ORDER BY points DESC`
    ).all();
    arenaRank = board.findIndex(r => r.user_id === userId) + 1;
    if (arenaRank === 0) arenaRank = 999;
  } catch { /* 忽略 */ }

  const RULES = {
    first_login:     () => true,
    prompt_5:        () => stats.prompts >= 5,
    prompt_20:       () => stats.prompts >= 20,
    call_50:         () => stats.calls >= 50,
    checkin_7:       () => stats.streak >= 7,
    checkin_30:      () => stats.streak >= 30,
    gacha_20:        () => stats.gacha >= 20,
    gacha_legend:    () => stats.gacha_leg >= 1,
    silly_10:        () => stats.silly >= 10,
    koi_30:          () => stats.koi >= 30,
    fail_5:          () => stats.fails >= 5,
    arena_1:         () => stats.wins >= 1,
    arena_10:        () => stats.wins >= 10,
    arena_season:    () => arenaRank > 0 && arenaRank <= 3,
    bingo_line:      () => bingoLines >= 1,
    bingo_full:      () => bingoFull,
    community_1:     () => stats.community >= 1,
    community_100:   () => stats.comm_likes >= 100,
    key_owner:       () => stats.keys >= 1
  };

  const { results: owned } = await env.DB.prepare(
    'SELECT badge_id FROM user_badges WHERE user_id = ?'
  ).bind(userId).all();
  const has = new Set(owned.map(o => o.badge_id));

  const unlocked = [];
  for (const [id, test] of Object.entries(RULES)) {
    if (has.has(id)) continue;
    let ok = false;
    try { ok = !!test(); } catch { ok = false; }
    if (!ok) continue;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)'
    ).bind(userId, id).run();
    unlocked.push(id);
  }
  return unlocked;
}

/* ---------- 选一个可用的模型：优先用户默认密钥，回退服务端内置 ---------- */
async function pickModel(env, user, model) {
  const krow = await env.DB.prepare(
    'SELECT * FROM user_keys WHERE user_id = ? AND is_default = 1 ORDER BY id DESC LIMIT 1'
  ).bind(user.id).first();

  if (krow) {
    const endpoint = resolveEndpoint(krow.provider, krow.base_url);
    if (!endpoint) return null;
    const apiKey = await decryptSecret(env, krow.key_enc, krow.key_iv);
    return { endpoint, apiKey, model: model || krow.model || defaultModel(krow.provider) || 'qwen-turbo' };
  }

  if (env[AI_KEY_VAR]) {
    return { endpoint: AI_ENDPOINT, apiKey: env[AI_KEY_VAR], model: model || 'qwen-turbo' };
  }
  return null;
}

/* ---------- 批量测试评分：让模型自己打分，失败则退化为启发式 ---------- */
async function judge(env, picked, job, output) {
  if (!output || !output.trim()) return 0;
  const rubric = [
    '你是提示词评测员。请只输出一个 0~10 的整数分数，不要任何解释。',
    '评分维度：是否完整回应了任务、表达是否清晰、信息密度是否足够。',
    '',
    '【任务】', String(job?.version?.user || '').slice(0, 800),
    '【变量】', JSON.stringify(job?.vars || {}),
    '【模型输出】', String(output).slice(0, 1500)
  ].join('\n');

  try {
    const res = await fetch(picked.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${picked.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: picked.model,
        messages: [{ role: 'user', content: rubric }],
        temperature: 0, max_tokens: 8, stream: false
      })
    });
    if (!res.ok) throw new Error('judge ' + res.status);
    const data = await res.json();
    const txt = String(data.choices?.[0]?.message?.content || '');
    const m = txt.match(/(\d{1,2})/);
    if (m) return Math.max(0, Math.min(10, Number(m[1])));
  } catch { /* 落到下面的启发式 */ }

  // 启发式兜底：长度适中得分高，过短或过长都扣分
  const len = output.trim().length;
  const score = len < 20 ? 3 : len < 80 ? 6 : len < 800 ? 8 : len < 3000 ? 7 : 6;
  return score;
}
