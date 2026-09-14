// 后端统一入口：Cloudflare Pages Functions catch-all
import {
  json, err, hashPassword, randomToken, currentUser, createSession,
  isEmail, logUsage, readStreamUsage, sessionCookie, clearCookie
} from '../_lib.js';

const AI_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const AI_KEY_VAR = 'DASHSCOPE_API_KEY';

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
    /* ---------- 认证 ---------- */
    if (path === 'auth/register' && method === 'POST') {
      const { email, password, nickname } = await body(request);
      if (!isEmail(email)) return err('邮箱格式不正确');
      if (!password || password.length < 6) return err('密码至少 6 位');

      const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (exists) return err('该邮箱已注册，请直接登录');

      const salt = randomToken(16);
      const hash = await hashPassword(password, salt);
      const nick = nickname || String(email).split('@')[0] || '创作者';

      const ins = await env.DB.prepare(
        `INSERT INTO users (email, password_hash, salt, nickname, credits)
         VALUES (?, ?, ?, ?, 500)`
      ).bind(email, hash, salt, nick).run();

      const token = await createSession(env, ins.meta.last_row_id);
      return json({ ok: true, token }, 200, { 'Set-Cookie': sessionCookie(token) });
    }

    if (path === 'auth/login' && method === 'POST') {
      const { email, password } = await body(request);
      const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (!row) return err('邮箱不存在，请先注册', 404);
      const hash = await hashPassword(password, row.salt);
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

    /* ---------- 以下需要登录 ---------- */
    const user = await currentUser(request, env);
    if (!user) return err('请先登录', 401);

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

    /* ---------- AI 对话 / 调试 ---------- */
    if (path === 'chat' && method === 'POST') {
      const apiKey = env[AI_KEY_VAR];
      if (!apiKey) return err('服务端未配置 DASHSCOPE_API_KEY', 500);

      const { messages, model = 'qwen-turbo', temperature = 0.7, stream = true } = await body(request);
      if (!Array.isArray(messages) || !messages.length) return err('messages 不能为空');

      const upstream = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature, stream })
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        await logUsage(env, user.id, model, null, 'error');
        return err(`模型调用失败：${text.slice(0, 200)}`, 502);
      }

      if (stream) {
        // 分流：一路直接返回前端，一路后台统计 token
        const [toClient, toMeter] = upstream.body.tee();
        ctx.waitUntil(readStreamUsage(toMeter).then(u => logUsage(env, user.id, model, u)));
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
      await logUsage(env, user.id, model, data.usage);
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
    return err('服务端异常：' + (e?.message || String(e)), 500);
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
