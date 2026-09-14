// 全局状态：当前用户 / 提示词 / 统计 / Bingo
import * as A from './api.js';

export const state = {
  user: null,          // { id, email, nickname, credits, streak }
  prompts: [],         // 云端提示词列表
  stats: null,         // { daily, models, totals, prompt_count, credits, recent }
  bingo: [],           // 25 格 0/1
  currentPromptId: null,
  model: 'qwen-plus'   // 调试台当前模型
};

export const MODELS = [
  { id: 'qwen-turbo', name: 'Qwen-Turbo' },
  { id: 'qwen-plus', name: 'Qwen-Plus' },
  { id: 'qwen-max', name: 'Qwen-Max' }
];

/* ---------------- 格式化 ---------------- */
export const nfmt = (n) => Number(n || 0).toLocaleString('zh-CN');

export const kfmt = (n) => {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

const todayStr = () => new Date().toISOString().slice(0, 10);

/* ---------------- 登录态 ---------------- */
export async function loadUser() {
  try {
    const r = await A.me();
    state.user = r.user || null;
  } catch {
    state.user = null;
  }
  return state.user;
}

/* ---------------- 数据 ---------------- */
export async function refreshPrompts() {
  try {
    const r = await A.listPrompts();
    state.prompts = r.prompts || [];
  } catch {
    state.prompts = [];
  }
  return state.prompts;
}

export async function refreshStats() {
  try {
    const r = await A.getStats();
    state.stats = r;
    if (r.credits != null && state.user) state.user.credits = r.credits;
  } catch {
    state.stats = null;
  }
  return state.stats;
}

export async function loadBingo() {
  try {
    const r = await A.getBingo();
    state.bingo = Array.isArray(r.cells) && r.cells.length === 25
      ? r.cells
      : Array(25).fill(0);
  } catch {
    state.bingo = Array(25).fill(0);
  }
  return state.bingo;
}

export async function refreshAll() {
  await Promise.all([refreshPrompts(), refreshStats(), loadBingo()]);
}

/* ---------------- 派生值 ---------------- */
export function todayCalls() {
  const d = state.stats?.daily || [];
  const t = d.find(x => x.day === todayStr());
  return t ? t.calls : 0;
}

export function totalTokens() {
  const t = state.stats?.totals;
  return (t?.p_tokens || 0) + (t?.c_tokens || 0);
}

export function bingoDone() {
  return state.bingo.reduce((a, b) => a + (b ? 1 : 0), 0);
}

/* Bingo 连成几条线 */
export function bingoLines() {
  const g = state.bingo;
  const lines = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map(c => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map(r => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines.filter(l => l.every(i => g[i])).length;
}

/* ---------------- 当前编辑中的提示词 ---------------- */
export function currentPrompt() {
  return state.prompts.find(p => p.id === state.currentPromptId) || null;
}

export function currentPromptText() {
  const p = currentPrompt();
  if (!p) return '';
  return [p.system_prompt, p.user_prompt].filter(Boolean).join('\n');
}
