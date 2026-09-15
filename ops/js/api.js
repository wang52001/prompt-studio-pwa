/* PromptOps 前端 API 封装 */
const API = '/opsapi';

/* GET 结果落一份 localStorage：断网时降级展示上次数据，而不是直接报错 */
const CACHE_PREFIX = 'ops:api:';
function cacheRead(path) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + path);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function cacheWrite(path, data) {
  try { localStorage.setItem(CACHE_PREFIX + path, JSON.stringify({ t: Date.now(), data })); } catch { /* 超配额忽略 */ }
}

async function api(path, options = {}) {
  const opt = { credentials: 'same-origin', ...options };
  const isGet = !opt.method || opt.method === 'GET';
  if (opt.body && typeof opt.body !== 'string') {
    opt.headers = { 'Content-Type': 'application/json', ...(opt.headers || {}) };
    opt.body = JSON.stringify(opt.body);
  }

  let res, text;
  try {
    res = await fetch(`${API}/${path}`, opt);
    text = await res.text();
  } catch (e) {
    const hit = isGet ? cacheRead(path) : null;
    if (hit) {
      window.__opsOffline = true;
      window.__opsOfflineAt = hit.t;
      return { ...hit.data, __offline: true, __cachedAt: hit.t };
    }
    const err = new Error('网络不可用');
    err.offline = true;
    throw err;
  }

  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`服务端返回异常 (${res.status})`); }
  if (!res.ok || data.error) throw new Error(data.error || `请求失败 (${res.status})`);
  window.__opsOffline = false;
  if (isGet) cacheWrite(path, data);
  return data;
}

const get  = (p) => api(p);
const post = (p, b) => api(p, { method: 'POST', body: b });
const del  = (p) => api(p, { method: 'DELETE' });

/* 小工具 */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 2200);
}

const fmtTime = (s) => {
  if (!s) return '—';
  const t = String(s).replace('T', ' ').slice(5, 16);
  return t;
};
function ago(s) {
  if (!s) return '—';
  const d = Date.now() - new Date(String(s).replace(' ', 'T') + 'Z').getTime();
  if (!isFinite(d)) return fmtTime(s);
  const m = Math.floor(d / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}
const money = (n) => `¥${Number(n || 0).toFixed(4)}`.replace(/0+$/, '').replace(/\.$/, '');
