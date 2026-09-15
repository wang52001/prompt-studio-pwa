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
      const { results } = await env.DB.prepare(
        `SELECT id, title, system_prompt, user_prompt, variables, model, version, updated_at
         FROM prompts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200`
      ).bind(user.id).all();
      return json({ prompts: results });
    }

    if (path === 'prompts' && method === 'POST') {
      const p = await body(request);
      if (!p.title) return err('标题不能为空');
      const r = await env.DB.prepare(
        `INSERT INTO prompts (user_id, title, system_prompt, user_prompt, variables, model)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(user.id, p.title, p.system_prompt || '', p.user_prompt || '',
             JSON.stringify(p.variables || {}), p.model || 'qwen-turbo').run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path.startsWith('prompts/') && method === 'PUT') {
      const id = path.split('/')[1];
      const p = await body(request);
      await env.DB.prepare(
        `UPDATE prompts SET title=?, system_prompt=?, user_prompt=?, variables=?, model=?,
         updated_at=datetime('now') WHERE id=? AND user_id=?`
      ).bind(p.title, p.system_prompt || '', p.user_prompt || '',
             JSON.stringify(p.variables || {}), p.model || 'qwen-turbo', id, user.id).run();
      return json({ ok: true });
    }

    if (path.startsWith('prompts/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM prompts WHERE id=? AND user_id=?').bind(id, user.id).run();
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
      await env.DB.prepare('UPDATE user_keys SET is_default = 0 WHERE user_id = ?').bind(user.id).run();
      await env.DB.prepare('UPDATE user_keys SET is_default = 1 WHERE id = ? AND user_id = ?')
        .bind(id, user.id).run();
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

      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: useModel, messages, temperature, stream })
      });

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

      await env.DB.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').bind(COST, user.id).run();
      await env.DB.prepare('INSERT INTO gacha_log (user_id, rarity, prize) VALUES (?, ?, ?)')
        .bind(user.id, prize.rarity, prize.text).run();

      const row = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(user.id).first();
      return json({ ok: true, rarity: prize.rarity, prize: prize.text, credits: row.credits });
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
      return json({ ok: true });
    }

    if (path === 'playground/arena' && method === 'POST') {
      const { my_score, ai_score } = await body(request);
      await env.DB.prepare('INSERT INTO arena_log (user_id, my_score, ai_score) VALUES (?, ?, ?)')
        .bind(user.id, my_score ?? 0, ai_score ?? 0).run();
      if ((my_score ?? 0) > (ai_score ?? 0)) {
        await env.DB.prepare('UPDATE users SET credits = credits + 20 WHERE id = ?').bind(user.id).run();
      }
      const row = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(user.id).first();
      return json({ ok: true, credits: row.credits });
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
