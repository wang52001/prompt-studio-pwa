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
export const listRoles = () => api('roles');
export const createRole = (r) => api('roles', { method: 'POST', body: r });
export const updateRole = (id, r) => api(`roles/${id}`, { method: 'PUT', body: r });
export const deleteRole = (id) => api(`roles/${id}`, { method: 'DELETE' });

export const promptVersions = (id) => api(`prompts/${id}/versions`);
export const restorePrompt = (id, version) =>
  api(`prompts/${id}/restore`, { method: 'POST', body: { version } });
// 只改标签 / 文件夹 / 置顶，不动版本号
export const updatePromptMeta = (id, meta) =>
  api(`prompts/${id}/meta`, { method: 'PUT', body: meta });

/* ---------------- 乐园 ---------------- */
export const drawGacha = () => api('playground/gacha', { method: 'POST' });
export const getGachaLogs = () => api('playground/gacha');
export const getBingo = () => api('playground/bingo');
export const saveBingo = (cells) => api('playground/bingo', { method: 'PUT', body: { cells } });
export const saveArena = (my, ai) => api('playground/arena', {
  method: 'POST', body: { my_score: my, ai_score: ai }
});

/* ---------------- 竞技场 ---------------- */
export const getArenaBoard   = () => api('playground/arena/board');
export const getArenaHistory = () => api('playground/arena/history');

/* ---------------- 沙雕生成器 ---------------- */
export const getSilly    = () => api('silly');
export const postSilly   = (text) => api('silly', { method: 'POST', body: { body: text } });
export const likeSilly   = (id) => api('silly/like', { method: 'POST', body: { id } });

/* ---------------- 成就徽章 ---------------- */
export const getBadges = () => api('badges');

/* ---------------- 锦鲤 / 打卡 ---------------- */
export const getKoi     = () => api('koi');
export const checkIn    = () => api('checkin', { method: 'POST' });
export const makeupDay  = (day) => api('koi/makeup', { method: 'POST', body: { day } });

/* ---------------- 翻车现场墙 ---------------- */
export const getFails   = (sort = 'new') => api(`fails?sort=${encodeURIComponent(sort)}`);
export const postFail   = (p) => api('fails', { method: 'POST', body: p });
export const likeFail   = (id) => api('fails/like', { method: 'POST', body: { id } });

/* ---------------- 社区广场 ---------------- */
export const getCommunity  = (sort = 'new', q = '') =>
  api(`community?sort=${encodeURIComponent(sort)}&q=${encodeURIComponent(q)}`);
export const postCommunity = (p) => api('community', { method: 'POST', body: p });
export const likeCommunity = (id) => api('community/like', { method: 'POST', body: { id } });
export const favCommunity  = (id) => api('community/fav', { method: 'POST', body: { id } });
export const getComments   = (postId) => api(`community/comments?post_id=${postId}`);
export const postComment   = (postId, content) =>
  api('community/comments', { method: 'POST', body: { post_id: postId, content } });

/* ---------------- 批量测试 ---------------- */
export const getBatchRuns = () => api('batch');
export const runBatch     = (p) => api('batch/run', { method: 'POST', body: p });

/* ---------------- 设置 / 灵感值 / 导出 ---------------- */
export const getSettings = () => api('settings');
export const saveSettings = (s) => api('settings', { method: 'PUT', body: s });
export const getCredits  = () => api('credits');
export const exportData  = () => api('export');
export const importPrompts = (prompts) => api('import', { method: 'POST', body: { prompts } });
export const sharePrompt = (id) => api(`prompts/${id}/share`, { method: 'POST' });
export const unsharePrompt = (id) => api(`prompts/${id}/share`, { method: 'DELETE' });
// 公开读取，不需要登录
export const getShared = (sid) => api(`share/${sid}`);

/* ---------------- 统计 ---------------- */
export const getStats = () => api('stats');

/* ---------------- 用户自带 AI 密钥 ---------------- */
export const listKeys   = () => api('keys');
export const addKey     = (p) => api('keys', { method: 'POST', body: p });
export const testKey    = (p) => api('keys/test', { method: 'POST', body: p });
export const setDefault = (id) => api('keys/default', { method: 'POST', body: { id } });
export const updateKey  = (id, p) => api(`keys/${id}`, { method: 'PUT', body: p });
export const deleteKey  = (id) => api(`keys/${id}`, { method: 'DELETE' });

// 取值方案：一套提示词保存多组变量值
export const varSets = (promptId) => api(`prompts/${promptId}/varsets`);
export const saveVarSet = (promptId, name, values) =>
  api(`prompts/${promptId}/varsets`, { method: 'POST', body: { name, values } });
export const deleteVarSet = (promptId, setId) =>
  api(`prompts/${promptId}/varsets/${setId}`, { method: 'DELETE' });

/* ---------------- 对话记录 ---------------- */
export const chatHistory = (promptId = 0) =>
  api(`chat-history${promptId ? `?prompt_id=${promptId}` : ''}`);
export const chatHistoryItem = (id) => api(`chat-history/${id}`);
export const deleteChatHistory = (id) => api(`chat-history/${id}`, { method: 'DELETE' });

/* ---------------- AI 一次性对话（非流式） ---------------- */
export const chatOnce = (messages, model = 'qwen-plus', temperature = 0.2) =>
  api('chat', { method: 'POST', body: { messages, model, temperature, stream: false } });

/* ---------------- AI 流式对话 ---------------- */
/**
 * @param {Array} messages  [{role, content}]
 * @param {Object} opts     { model, temperature, onDelta, signal }
 * @returns {Promise<void>}
 */
export async function chatStream(messages, { model = 'qwen-turbo', temperature = 0.7, promptId = null, onDelta, signal } = {}) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model, temperature, stream: true, prompt_id: promptId }),
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
