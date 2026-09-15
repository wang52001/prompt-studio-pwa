// 后端接口客户端
const BASE = '/api';

/** 通用 JSON 请求；后端统一返回 { error } 时抛出 Error */
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('网络连接失败，请检查网络');
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 200) || `请求失败 ${res.status}`);
    return text;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
  return data;
}

/* ---------------- 认证 ---------------- */
// 邮箱验证码登录（主流程）
export const sendCode    = (email, nickname) =>
  api('auth/send-code', { method: 'POST', body: { email, nickname } });

export const verifyCode  = (email, code, nickname) =>
  api('auth/verify-code', { method: 'POST', body: { email, code, nickname } });

// 密码登录（需该账号已设置密码）
export const login       = (email, password) =>
  api('auth/login', { method: 'POST', body: { email, password } });

// 设置 / 修改密码（需已登录）
export const setPassword = (password, oldPassword) =>
  api('auth/set-password', { method: 'POST', body: { password, old_password: oldPassword } });

export const logout = () => api('auth/logout', { method: 'POST' });

export const me = () => api('auth/me');

/* ---------------- 提示词 ---------------- */
export const listPrompts = () => api('prompts');
export const createPrompt = (p) => api('prompts', { method: 'POST', body: p });
export const updatePrompt = (id, p) => api(`prompts/${id}`, { method: 'PUT', body: p });
export const deletePrompt = (id) => api(`prompts/${id}`, { method: 'DELETE' });

/* ---------------- 乐园 ---------------- */
export const drawGacha = () => api('playground/gacha', { method: 'POST' });
export const getGachaLogs = () => api('playground/gacha');
export const getBingo = () => api('playground/bingo');
export const saveBingo = (cells) => api('playground/bingo', { method: 'PUT', body: { cells } });
export const saveArena = (my, ai) => api('playground/arena', {
  method: 'POST', body: { my_score: my, ai_score: ai }
});

/* ---------------- 统计 ---------------- */
export const getStats = () => api('stats');

/* ---------------- 用户自带 AI 密钥 ---------------- */
export const listKeys   = () => api('keys');
export const addKey     = (p) => api('keys', { method: 'POST', body: p });
export const testKey    = (p) => api('keys/test', { method: 'POST', body: p });
export const setDefault = (id) => api('keys/default', { method: 'POST', body: { id } });
export const updateKey  = (id, p) => api(`keys/${id}`, { method: 'PUT', body: p });
export const deleteKey  = (id) => api(`keys/${id}`, { method: 'DELETE' });

/* ---------------- AI 一次性对话（非流式） ---------------- */
export const chatOnce = (messages, model = 'qwen-plus', temperature = 0.2) =>
  api('chat', { method: 'POST', body: { messages, model, temperature, stream: false } });

/* ---------------- AI 流式对话 ---------------- */
/**
 * @param {Array} messages  [{role, content}]
 * @param {Object} opts     { model, temperature, onDelta, signal }
 * @returns {Promise<void>}
 */
export async function chatStream(messages, { model = 'qwen-turbo', temperature = 0.7, onDelta, signal } = {}) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model, temperature, stream: true }),
    signal
  });

  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try { msg = JSON.parse(t).error || t; } catch { /* 非 JSON 直接用原文 */ }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';            // 保留未完整的一行

    for (const line of lines) {
      const raw = line.trim();
      if (!raw.startsWith('data:')) continue;
      const data = raw.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onDelta?.(delta);
      } catch { /* 忽略无法解析的心跳行 */ }
    }
  }
}
