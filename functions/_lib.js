// 后端公共库（下划线开头，不会被当作路由）
const enc = new TextEncoder();

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });

export const err = (msg, status = 400) => json({ error: msg }, status);

export const toHex = (buf) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export const randomToken = (bytes = 32) => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
};

/* ---------- 密码：PBKDF2-SHA256 ---------- */
export async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(saltHex), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  return toHex(bits);
}

/* ---------- 会话 ---------- */
const COOKIE = 'sid';
const TTL_DAYS = 30;

export const sessionCookie = (token) =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_DAYS * 86400}`;

export const clearCookie = () =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

function tokenFromRequest(request) {
  const m = request.headers.get('Cookie')?.match(/(?:^|;\s*)sid=([^;]+)/);
  return m ? m[1] : null;
}

/** 读取当前登录用户，未登录返回 null */
export async function currentUser(request, env) {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();
  if (!row) return null;
  return {
    id: row.id, email: row.email, nickname: row.nickname,
    credits: row.credits, streak: row.streak, created_at: row.created_at,
    has_password: !!row.password_hash
  };
}

export async function createSession(env, userId) {
  const token = randomToken();
  // 过期时间直接用 SQLite 计算，保证与 datetime('now') 同格式（UTC 'YYYY-MM-DD HH:MM:SS'）
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', ?))`
  ).bind(token, userId, `+${TTL_DAYS} days`).run();
  return token;
}

/* ---------- 校验 ---------- */
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));

/* ---------- 用量统计 ---------- */
export async function logUsage(env, userId, model, usage, status = 'ok') {
  try {
    await env.DB.prepare(
      `INSERT INTO usage (user_id, model, prompt_tokens, completion_tokens, status)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      userId, model || 'qwen-turbo',
      usage?.prompt_tokens || 0,
      usage?.completion_tokens || 0,
      status
    ).run();
  } catch { /* 统计失败不影响主流程 */ }
}

/** 读取 SSE 流，抓取最后的 usage 字段 */
export async function readStreamUsage(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let usage = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value, { stream: true }).split('\n')) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const j = JSON.parse(raw);
          if (j.usage) usage = j.usage;
        } catch { /* 忽略非 JSON 行 */ }
      }
    }
  } catch { /* 忽略解析异常 */ }
  return usage;
}
