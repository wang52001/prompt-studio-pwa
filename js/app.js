// Prompt Studio PWA — 主逻辑：认证 / 路由 / 云端数据 / AI 真实调用
import { screens, showTabBar, TITLES } from './screens.js';
import * as A from './api.js';
import { icons } from './icons.js';
import {
  state, MODELS, PROVIDERS, providerName, nfmt, kfmt, loadUser, refreshPrompts,
  refreshStats, loadBingo, refreshKeys, refreshAll, todayCalls, totalTokens,
  bingoDone, bingoLines, currentPrompt, availableModels, activeKey, usingOwnKey
} from './store.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const appEl     = $('#app');
const screensEl = $('#screens');
const tabbarEl  = $('.tabbar');
const toastEl   = $('#toast');
const overlayEl = $('#overlay');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const setText = (sel, v) => $$(sel).forEach(el => { el.textContent = v; });
const setW    = (sel, p) => $$(sel).forEach(el => { el.style.width = p; });

let splashTimer = null;

/* ================= 渲染 ================= */
function renderAll() {
  screensEl.innerHTML = Object.entries(screens).map(([id, fn]) => fn()).join('');
}

/* ================= 路由 ================= */
const parseHash = () => (location.hash || '').replace(/^#\/?/, '').trim() || 'splash';

/** 路由支持子路径：ops/run/8 → 页面 id = ops，子路径 run/8 交给模块自己解析 */
const splitPath = (p) => {
  const i = String(p).indexOf('/');
  return i === -1 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
};

function go(path) {
  const [id] = splitPath(path);
  if (!screens[id]) path = 'workbench';
  const hash = `#/${path}`;
  if (location.hash === hash) { apply(path); return; }
  location.hash = hash;
}

function apply(path) {
  let [id, sub] = splitPath(path);
  if (!screens[id]) { id = 'workbench'; sub = ''; }

  // 未登录：除登录页外一律拦截
  if (!state.user && id !== 'login') { go('login'); return; }
  // 已登录：不该停在登录页
  if (state.user && id === 'login') { go('workbench'); return; }

  clearTimeout(splashTimer);
  if (id === 'splash') {
    splashTimer = setTimeout(() => {
      history.replaceState(null, '', '#/workbench');
      apply('workbench');
    }, 1800);
  }

  $$('.screen').forEach(el => el.classList.toggle('active', el.dataset.screen === id));

  const isTab = showTabBar(id);
  appEl.classList.toggle('no-tabbar', !isTab);
  tabbarEl.setAttribute('aria-hidden', String(!isTab));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));

  const sc = $(`.screen[data-screen="${id}"] .screen-scroll`);
  if (sc) sc.scrollTop = 0;

  if (id === 'apikeys') renderKeys();
  if (id === 'debug') updateModelPill();
  if (id === 'silly') loadSilly();
  if (id === 'badges') loadBadges();
  if (id === 'koi') loadKoi();
  if (id === 'failwall') loadFails();
  if (id === 'community') loadCommunity();
  if (id === 'credits') loadCredits();
  if (id === 'settings') loadSettings();

  // 评测模块：子路径交给 PromptOps 自己解析（#/ops/run/8 → sub = run/8）
  if (id === 'ops') window.OpsModule?.route(sub);

  document.title = id === 'splash'
    ? 'Prompt Studio 提示词工坊'
    : `${TITLES[id] || ''} · Prompt Studio`;
}

/* ================= Toast / 浮层 ================= */
let toastTimer = null;
function toast(msg, type = '') {
  if (!msg) return;
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  toastEl.setAttribute('aria-hidden', 'false');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.className = 'toast';
    toastEl.setAttribute('aria-hidden', 'true');
  }, 2200);
}

function overlay(html) {
  overlayEl.innerHTML = `<div class="sheet">${html}</div>`;
  overlayEl.classList.add('show');
  overlayEl.setAttribute('aria-hidden', 'false');
}
function closeOverlay() {
  overlayEl.classList.remove('show');
  overlayEl.setAttribute('aria-hidden', 'true');
  overlayEl.innerHTML = '';
}

/* ================= 主题 ================= */
function setTheme(color) {
  document.documentElement.style.setProperty('--primary', color);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
  $$('[data-action="theme"]').forEach(el => {
    el.className = `swatch${el.dataset.color === color ? ' active' : ''}`;
  });
}

/* ================= 登录 / 注册 ================= */
function authMsg(text, bad = false) {
  const el = $('#authMsg');
  if (!el) return;
  el.textContent = text || '';
  el.className = `auth-msg${text ? (bad ? ' bad' : ' ok') : ''}`;
}

let authMode = 'code';        // 'code' | 'password'
let cooldownTimer = null;

/** 切换验证码 / 密码两种登录方式 */
function setAuthMode(mode) {
  authMode = mode === 'password' ? 'password' : 'code';
  const isCode = authMode === 'code';

  $('#tabCode')?.classList.toggle('active', isCode);
  $('#tabPwd')?.classList.toggle('active', !isCode);

  const code = $('#authCode'), pwd = $('#authPassword'),
        nick = $('#authNickname'), send = $('#authSendCode'),
        btn = $('#authSubmit'), toggle = $('#authToggle');

  if (code)  { code.hidden  = !isCode; code.value = ''; }
  if (pwd)   { pwd.hidden   = isCode;  pwd.value = ''; }
  if (nick)  nick.hidden    = !isCode;
  if (send)  send.hidden    = !isCode;
  if (btn)   { btn.dataset.mode = authMode; btn.textContent = isCode ? '登录 / 注册' : '登录'; }
  if (toggle) toggle.textContent = isCode ? '还没账号？填邮箱就能自动创建' : '用验证码登录 / 注册';

  authMsg('');
}

function startCooldown(sec) {
  const btn = $('#authSendCode');
  if (!btn) return;
  clearInterval(cooldownTimer);
  let left = sec;
  btn.disabled = true;
  btn.textContent = `${left}s`;
  cooldownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(cooldownTimer);
      btn.disabled = false;
      btn.textContent = '获取验证码';
    } else {
      btn.textContent = `${left}s`;
    }
  }, 1000);
}

const readEmail = () => ($('#authEmail')?.value || '').trim().toLowerCase();

async function sendCodeFlow() {
  const email = readEmail();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authMsg('请先填写正确的邮箱', true); return; }

  const btn = $('#authSendCode');
  btn.disabled = true;
  btn.textContent = '发送中…';
  authMsg('');

  try {
    const r = await A.sendCode(email);
    startCooldown(r.resend_after || 60);
    if (r.dev_code) {
      authMsg(`验证码已生成（邮件服务未配置，当前为调试模式）：${r.dev_code}`);
    } else {
      authMsg('验证码已发送，请查收邮件（留意垃圾邮件）');
    }
    setTimeout(() => $('#authCode')?.focus(), 80);
  } catch (e) {
    authMsg(e.message || '验证码发送失败', true);
    btn.disabled = false;
    btn.textContent = '获取验证码';
  }
}

async function submitAuth() {
  const btn = $('#authSubmit');
  const email = readEmail();
  const code = ($('#authCode')?.value || '').trim();
  const nickname = ($('#authNickname')?.value || '').trim();
  const password = $('#authPassword')?.value || '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authMsg('请先填写正确的邮箱', true); return; }

  btn.disabled = true;
  btn.textContent = authMode === 'code' ? '验证中…' : '登录中…';
  authMsg('');

  try {
    let hasPassword = true;
    if (authMode === 'code') {
      if (!/^\d{6}$/.test(code)) { throw new Error('请输入 6 位数字验证码'); }
      const r = await A.verifyCode(email, code, nickname);
      hasPassword = !!(r.user && r.user.has_password);
    } else {
      if (password.length < 6) throw new Error('密码至少 6 位');
      await A.login(email, password);
      hasPassword = true;
    }

    state.user = await loadUser();
    if (!state.user) throw new Error('登录态写入失败，请重试');

    clearAuthForm();
    toast(`欢迎，${state.user.nickname} 👋`, 'success');
    await refreshAll();
    syncAll();
    go('workbench');

    if (!hasPassword) setTimeout(() => openPasswordSheet(true), 400);
  } catch (e) {
    authMsg(e.message || '操作失败', true);
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'code' ? '登录 / 注册' : '登录';
  }
}

function clearAuthForm() {
  ['#authEmail', '#authCode', '#authPassword', '#authNickname'].forEach(s => {
    const el = $(s); if (el) el.value = '';
  });
  authMsg('');
}

/* ---------- 设置 / 修改密码 ---------- */
function openPasswordSheet(canSkip = true) {
  const has = !!state.user?.has_password;
  overlay(`
    <div class="text-center" style="margin-bottom:12px">
      <div style="font-size:16px;font-weight:700">${has ? '修改登录密码' : '设置登录密码'}</div>
      <div class="text-sm text-muted" style="margin-top:4px">
        ${has ? '修改后原密码立即失效' : '设置后可直接用 邮箱 + 密码 登录'}
      </div>
    </div>
    <div class="card" style="text-align:left">
      ${has ? '<input class="auth-input" id="pwOld" type="password" placeholder="原密码" />' : ''}
      <input class="auth-input${has ? ' mt-2' : ''}" id="pwNew" type="password" placeholder="新密码，至少 6 位" />
      <input class="auth-input mt-2" id="pwConfirm" type="password" placeholder="再输入一次" />
      <div class="auth-msg" id="pwMsg"></div>
    </div>
    <div class="action-bar mt-2">
      ${canSkip ? '<button class="btn ghost block" data-close>以后再说</button>' : ''}
      <button class="btn block" data-action="do-set-password">保存</button>
    </div>`);
}

function pwMsg(text, bad = true) {
  const el = $('#pwMsg');
  if (!el) return;
  el.textContent = text || '';
  el.className = `auth-msg${text ? (bad ? ' bad' : '') : ''}`;
}

async function submitSetPassword() {
  const p = $('#pwNew')?.value || '';
  const c = $('#pwConfirm')?.value || '';
  const old = $('#pwOld')?.value || '';

  if (p.length < 6) { pwMsg('密码至少 6 位'); return; }
  if (p !== c) { pwMsg('两次输入的密码不一致'); return; }

  try {
    await A.setPassword(p, old);
    if (state.user) state.user.has_password = true;
    setText('[data-user="pwState"]', '已设置');
    closeOverlay();
    toast('密码已保存 ✓', 'success');
  } catch (e) {
    pwMsg(e.message || '保存失败');
  }
}

async function doLogout() {
  try { await A.logout(); } catch { /* 忽略 */ }
  state.user = null;
  state.prompts = [];
  state.stats = null;
  state.bingo = Array(25).fill(0);
  state.currentPromptId = null;
  chatHistory = [];
  clearInterval(cooldownTimer);
  const sendBtn = $('#authSendCode');
  if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '获取验证码'; }
  clearAuthForm();
  setAuthMode('code');
  toast('已退出登录');
  go('login');
}

/* ================= 数据 → 视图 ================= */
function syncAll() {
  if (!state.user) return;
  const u = state.user;
  const s = state.stats;
  const tokens = totalTokens();

  setText('[data-user="avatar"]', String(u.nickname || u.email || '创').trim().charAt(0).toUpperCase());
  setText('[data-user="nickname"]', u.nickname || '创作者');
  setText('[data-user="email"]', u.email || '');
  setText('[data-user="pwState"]', u.has_password ? '已设置' : '未设置');

  setText('[data-stat="credits"]', nfmt(u.credits));
  setText('[data-stat="calls"]', nfmt(s?.totals?.calls || 0));
  setText('[data-stat="tokens"]', kfmt(tokens));
  setText('[data-stat="prompts"]', nfmt(state.prompts.length));
  setText('[data-stat="streak"]', u.streak ?? 0);
  setText('[data-stat="bingoDone"]', bingoDone());
  setText('[data-stat="bingoLines"]', bingoLines());

  const today = todayCalls();
  setText('[data-stat="todayCalls"]', nfmt(today));
  const days = s?.daily || [];
  const y = days[days.length - 2]?.calls || 0;
  setText('[data-stat="todayDelta"]',
    y ? (today >= y ? `较昨日 +${Math.round((today - y) / y * 100)}%` : `较昨日 ${Math.round((today - y) / y * 100)}%`)
      : '较昨日 —');

  setW('[data-stat="tokenBar"]', `${Math.min(100, Math.round(tokens / 200000 * 100))}%`);
  setW('[data-stat="levelBar"]', `${Math.min(100, Math.round((u.credits % 1000) / 10))}%`);

  renderRecent();
  renderLibrary();
  paintBingo();
  renderStats();
  renderKeys();
  updateModelPill();
}

function relTime(t) {
  if (!t) return '—';
  const d = new Date(String(t).replace(' ', 'T') + 'Z');
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 172800) return '昨天';
  return String(t).slice(0, 10);
}

function renderRecent() {
  const row = $('#recentRow');
  if (!row) return;
  if (!state.prompts.length) {
    row.innerHTML = `<div class="text-xs text-muted" style="padding:6px 2px">还没有提示词，点上面「新建提示词」开始吧</div>`;
    return;
  }
  row.innerHTML = state.prompts.slice(0, 4).map(p => `
    <div class="recent-card" data-action="open-prompt" data-id="${p.id}">
      <span class="title">${esc(p.title)}</span>
      <span class="meta">● ${relTime(p.updated_at)}</span>
    </div>`).join('');
}

/* ================= 素材库 ================= */
function renderLibrary() {
  const grid = $('#libGrid');
  if (!grid) return;
  const q = ($('#libSearch')?.value || '').trim().toLowerCase();
  if ($('#libCount')) $('#libCount').textContent = `${state.prompts.length} 条`;

  const list = state.prompts.filter(p =>
    !q || [p.title, p.system_prompt, p.user_prompt].filter(Boolean).join(' ').toLowerCase().includes(q));

  if (!list.length) {
    grid.innerHTML = `<div class="text-xs text-muted">${
      state.prompts.length ? '没有匹配的提示词' : '还没有提示词，点下面「新建提示词」'}</div>`;
    return;
  }
  grid.innerHTML = list.map(p => `
    <div class="lib-card" data-action="open-prompt" data-id="${p.id}">
      <span class="title">${esc(p.title)}</span>
      <span class="preview">${esc((p.system_prompt || p.user_prompt || '（空）').slice(0, 60))}</span>
      <span class="meta">${relTime(p.updated_at)}
        &nbsp;·&nbsp;<span class="text-danger" data-action="del-prompt" data-id="${p.id}">删除</span>
      </span>
    </div>`).join('');
}

/* ================= 编辑器 ================= */
const varsToText = (v) => {
  let o = {};
  try { o = typeof v === 'string' ? JSON.parse(v || '{}') : (v || {}); } catch { o = {}; }
  return Object.entries(o).map(([k, val]) => `${k}=${val}`).join('\n');
};

const textToVars = (t) => {
  const o = {};
  String(t || '').split('\n').forEach(line => {
    const i = line.indexOf('=');
    if (i > 0) o[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return o;
};

function editorData() {
  return {
    title: ($('#edTitle')?.value || '').trim(),
    system_prompt: ($('#edSystem')?.innerText || '').trim(),
    user_prompt: ($('#edUser')?.innerText || '').trim(),
    variables: textToVars($('#edVars')?.innerText),
    model: state.model
  };
}

function buildPreview() {
  const d = editorData();
  const fill = (s) => s.replace(/\$\{([^}]+)\}/g, (_, k) => d.variables[k] ?? '');
  const txt = [fill(d.system_prompt), fill(d.user_prompt)].filter(Boolean).join('\n\n');
  const el = $('#edPreview');
  if (el) el.textContent = txt || '填写上方内容后自动生成…';
  const c = $('#edCount');
  if (c) c.textContent = `${txt.length} 字 ≈ ${Math.round(txt.length * 0.72)} Token`;
  return txt;
}

function loadEditorPrompt(p) {
  state.currentPromptId = p?.id ?? null;
  state.editorRole = null;   // 打开已有/新建提示词时，角色标签重新开始
  if ($('#edTitle')) $('#edTitle').value = p?.title || '';
  if ($('#edSystem')) $('#edSystem').textContent = p?.system_prompt || '';
  if ($('#edUser')) $('#edUser').textContent = p?.user_prompt || '';
  if ($('#edVars')) $('#edVars').textContent = varsToText(p?.variables);
  if ($('#edSaved')) $('#edSaved').textContent = p ? `已保存 · ${relTime(p.updated_at)}` : '未保存';
  syncEditorRole();
  buildPreview();
}

function newPrompt() {
  loadEditorPrompt(null);
  go('editor');
  setTimeout(() => $('#edTitle')?.focus(), 60);
}

async function savePrompt() {
  const d = editorData();
  if (!d.title) { toast('先给提示词起个标题', 'warning'); return; }
  if (!d.system_prompt && !d.user_prompt) { toast('内容还是空的', 'warning'); return; }

  try {
    if (state.currentPromptId) {
      await A.updatePrompt(state.currentPromptId, d);
    } else {
      const r = await A.createPrompt(d);
      state.currentPromptId = r.id;
    }
    await Promise.all([refreshPrompts(), refreshStats()]);
    if ($('#edSaved')) $('#edSaved').textContent = '已保存 · 刚刚';
    toast('已同步到云端 ✓', 'success');
    syncAll();
  } catch (e) {
    toast('保存失败：' + e.message, 'danger');
  }
}

async function deletePrompt(id) {
  if (!confirm('确定删除这条提示词？')) return;
  try {
    await A.deletePrompt(id);
    if (state.currentPromptId === id) loadEditorPrompt(null);
    await Promise.all([refreshPrompts(), refreshStats()]);
    toast('已删除', 'success');
    syncAll();
  } catch (e) { toast('删除失败：' + e.message, 'danger'); }
}

/* ================= 编辑器：预设角色 ================= */
/* 选角色 = 往 System 里填一份现成的角色模板，之后随便改；
   内容已存在时会先确认，避免辛辛苦苦写的提示词被一把覆盖。 */
const EDITOR_ROLES = [
  { id: 'copywriter', name: '文案写手', desc: '种草文案、卖点提炼', system:
    '你是一位资深文案策划，擅长把产品卖点写成有画面感、能打动人的中文文案。\n' +
    '要求：\n1. 先给 3 个不同风格的标题；\n2. 正文口语化、有节奏，避免堆砌形容词；\n' +
    '3. 结尾给一句能直接用在海报上的 slogan。' },
  { id: 'translator', name: '翻译官', desc: '中英互译，保留语气', system:
    '你是一名专业中英互译。收到中文就译成英文，收到英文就译成中文。\n' +
    '要求：只输出译文，不要解释；保留原文的语气和格式；专有名词首次出现时在括号里标注原文。' },
  { id: 'coder', name: '代码助手', desc: '讲解、改错、重构', system:
    '你是一位资深工程师。用户给你代码或需求，你要：\n' +
    '1. 先用一两句话说明思路；\n2. 给出完整可运行的代码（标注语言）；\n' +
    '3. 指出潜在坑与边界情况。默认使用用户上下文中的语言回答。' },
  { id: 'analyst', name: '数据分析师', desc: '看数、拆因、给结论', system:
    '你是一位严谨的数据分析师。用户提供数据或指标，你要：\n' +
    '1. 先复述关键数字确认理解；\n2. 拆解可能的成因（按影响从大到小）；\n' +
    '3. 给出明确结论与下一步该看的指标。不要编造数据，缺什么就问什么。' },
  { id: 'pm', name: '产品经理', desc: '需求拆解、方案设计', system:
    '你是一位经验丰富的产品经理。用户提出模糊需求时，你要：\n' +
    '1. 先列出不明确的点并追问；\n2. 给出最小可行方案（MVP）；\n' +
    '3. 说明边界情况与不做什么。输出用短段落 + 列表，别写空话。' },
  { id: 'teacher', name: '讲解老师', desc: '把复杂讲简单', system:
    '你是一位擅长深入浅出的老师。用生活化的类比解释概念，从「它解决什么问题」讲到「怎么用」。\n' +
    '每次结尾给一句一句话总结，并问用户是否要更深入的例子。' },
  { id: 'interviewer', name: '面试官', desc: '模拟问答、给点评', system:
    '你是一位严格的面试官，一次只问一个问题。收到回答后：\n' +
    '1. 先点评亮点与不足（各一条）；\n2. 追问一个更深的点；\n3. 满三轮后给出总体评价与建议。' },
  { id: 'summarizer', name: '总结摘要', desc: '长文压缩、提炼要点', system:
    '你负责把长内容压缩成易读的摘要。输出结构：\n' +
    '1. 一句话核心结论；\n2. 3-5 条要点（保留关键数字）；\n3. 值得注意的风险或争议点。\n不要添加原文没有的信息。' }
];

function editorRoleLabel() {
  const r = EDITOR_ROLES.find(x => x.id === state.editorRole);
  return r ? r.name : '未设置';
}

function syncEditorRole() {
  const el = $('#edRoleName');
  if (el) el.textContent = editorRoleLabel();
}

function openRoleSheet() {
  overlay(`
    <div class="text-bold" style="font-size:15px;margin-bottom:4px">切换预设角色</div>
    <div class="text-xs text-muted" style="margin-bottom:10px">选一个会把 System 提示词替换成对应模板，选完还能继续改</div>
    <div style="max-height:52vh;overflow-y:auto">
      ${EDITOR_ROLES.map(r => `
        <div class="list-item" data-action="role-apply" data-role="${r.id}"
             style="${state.editorRole === r.id ? 'border-color:var(--primary);' : ''}">
          <div style="flex:1">
            <div class="text-bold text-sm">${r.name}${state.editorRole === r.id ? ' <span class="tag ok">当前</span>' : ''}</div>
            <div class="text-xs text-muted" style="margin-top:2px">${r.desc}</div>
          </div>
          <span class="text-muted">${icons.chevron}</span>
        </div>`).join('')}
    </div>
    <div class="action-bar mt-2"><button class="btn ghost block" data-close>取消</button></div>`);
}

async function applyEditorRole(id) {
  const r = EDITOR_ROLES.find(x => x.id === id);
  if (!r) return;
  const cur = ($('#edSystem')?.innerText || '').trim();
  if (cur && !confirm(`用「${r.name}」模板替换现在的 System 提示词？\n（原内容会被覆盖，建议先保存）`)) return;
  if ($('#edSystem')) $('#edSystem').innerText = r.system;
  state.editorRole = id;
  syncEditorRole();
  buildPreview();
  markEditorDirty();
  closeOverlay();
  toast(`已切换为「${r.name}」· 记得保存`, 'success');
}

/* 内容变了但还没保存：顶部状态提示回「未保存」 */
function markEditorDirty() {
  if ($('#edSaved')) $('#edSaved').textContent = '未保存';
}

/* ================= 编辑器：更多菜单（复制 / 导出 / 版本历史） ================= */
function openEditorMore() {
  overlay(`
    <div class="text-bold" style="font-size:15px;margin-bottom:10px">${$('#edTitle')?.value?.trim() || '未命名提示词'}</div>
    <div class="list-item" data-action="editor-copy"><span>复制全文</span><span class="text-muted">${icons.chevron}</span></div>
    <div class="list-item" data-action="editor-export"><span>导出为 .txt</span><span class="text-muted">${icons.chevron}</span></div>
    <div class="list-item" data-action="editor-versions"><span>版本历史</span><span class="text-muted">${icons.chevron}</span></div>
    <div class="action-bar mt-2"><button class="btn ghost block" data-close>关闭</button></div>`);
}

async function editorVersionsSheet() {
  if (!state.currentPromptId) { toast('先保存一次，才会有版本记录', 'warning'); return; }
  overlay('<div class="text-muted" style="padding:20px;text-align:center">加载中…</div>');
  try {
    const r = await A.promptVersions(state.currentPromptId);
    const list = r.versions || [];
    state.__lastVersions = list;   // 供「预览某个版本」按 version 号回查
    if (!list.length) {
      overlay(`
        <div class="text-bold" style="font-size:15px;margin-bottom:8px">版本历史</div>
        <div class="empty" style="padding:24px 0">还没有历史版本<br><span class="text-xs text-muted">每次保存都会自动留档，改坏了随时能回来</span></div>
        <div class="action-bar mt-2"><button class="btn ghost block" data-close>知道了</button></div>`);
      return;
    }
    overlay(`
      <div class="text-bold" style="font-size:15px;margin-bottom:4px">版本历史</div>
      <div class="text-xs text-muted" style="margin-bottom:10px">点任意版本可预览，确认后恢复</div>
      <div style="max-height:52vh;overflow-y:auto">
        ${list.map(v => `
          <div class="list-item" data-action="version-preview" data-version="${v.version}">
            <div style="flex:1">
              <div class="text-bold text-sm">v${v.version} · ${esc(v.title || '未命名')}</div>
              <div class="text-xs text-muted" style="margin-top:2px">${esc(relTime(v.created_at))} · ${(v.system_prompt || '').length + (v.user_prompt || '').length} 字</div>
            </div>
            <span class="text-muted">${icons.chevron}</span>
          </div>`).join('')}
      </div>
      <div class="action-bar mt-2"><button class="btn ghost block" data-close>关闭</button></div>`);
  } catch (e) {
    overlay(`<div class="empty">加载失败<br><span class="text-xs text-muted">${esc(e.message)}</span></div>
             <div class="action-bar mt-2"><button class="btn ghost block" data-close>关闭</button></div>`);
  }
}

function versionPreviewSheet(v) {
  const fill = (s) => String(s || '').replace(/\$\{([^}]+)\}/g, (_, k) => (v.variables ? (JSON.parse(v.variables) || {})[k] ?? '' : ''));
  const body = [fill(v.system_prompt), fill(v.user_prompt)].filter(Boolean).join('\n\n');
  overlay(`
    <div class="text-bold" style="font-size:15px">v${v.version} · ${esc(v.title || '未命名')}</div>
    <div class="text-xs text-muted" style="margin:4px 0 10px">${esc(relTime(v.created_at))} · 恢复后当前内容也会自动留档</div>
    <pre class="content" style="max-height:40vh;overflow:auto;white-space:pre-wrap;word-break:break-word;
         background:var(--surface-2);border-radius:12px;padding:12px;font-size:13px">${esc(body) || '（空）'}</pre>
    <div class="action-bar mt-2">
      <button class="btn ghost block" data-close>取消</button>
      <button class="btn block" data-action="version-restore" data-version="${v.version}">恢复这个版本</button>
    </div>`);
}

async function restoreEditorVersion(version) {
  try {
    await A.restorePrompt(state.currentPromptId, version);
    closeOverlay();
    await refreshPrompts();
    const cur = (state.prompts || []).find(x => x.id === state.currentPromptId);
    loadEditorPrompt(cur);
    await refreshStats();
    toast(`已恢复到 v${version} ✓`, 'success');
    syncAll();
  } catch (e) { toast('恢复失败：' + e.message, 'danger'); }
}

function exportEditorTxt() {
  const d = editorData();
  const txt = buildPreview() || '';
  const name = (d.title || 'prompt').replace(/[\\/:*?"<>|]/g, '_') + '.txt';
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  closeOverlay();
  toast('已导出 ' + name, 'success');
}

async function quickSave(title, text) {
  try {
    await A.createPrompt({ title, user_prompt: text, model: state.model });
    await refreshPrompts();
    toast('已保存到素材库 ✓', 'success');
    syncAll();
  } catch (e) { toast('保存失败：' + e.message, 'danger'); }
}

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    toast('已复制到剪贴板 ✓', 'success');
  } catch { toast('复制失败，请手动选择', 'warning'); }
}

/* ================= API 密钥 ================= */
function renderKeys() {
  const box = $('#keyList');
  if (!box) return;
  const list = state.keys || [];

  if (!list.length) {
    box.innerHTML = `<div class="card">
      <div class="text-sm text-muted" style="line-height:1.7">
        还没有密钥。添加后调试台会优先用它调用模型，费用走你自己的账号。
      </div></div>`;
    return;
  }

  box.innerHTML = list.map(k => {
    const st = k.status === 'ok' ? '<span class="text-success">可用</span>'
      : k.status === 'error' ? '<span class="text-danger">异常</span>'
      : '<span class="text-muted">未测试</span>';
    return `
      <div class="card key-card${k.is_default ? ' key-default' : ''}">
        <div class="text-sm text-bold">${esc(providerName(k.provider))}&nbsp;&nbsp;·&nbsp;&nbsp;${st}${
          k.is_default ? '&nbsp;·&nbsp;<span class="text-primary">默认</span>' : ''}</div>
        <div class="text-sm text-muted mt-2">${esc(k.key_hint || '')}</div>
        ${k.base_url ? `<div class="text-xs text-muted mt-1">${esc(k.base_url)}</div>` : ''}
        <div class="text-xs text-muted mt-1">模型 ${esc(k.model || '—')}</div>
        ${k.last_error ? `<div class="text-xs text-danger mt-1">${esc(k.last_error)}</div>` : ''}
        <div class="ops">
          <span data-action="key-test" data-id="${k.id}">测试连接</span>
          ${k.is_default ? '' : `<span data-action="key-default" data-id="${k.id}">设为默认</span>`}
          <span class="text-danger" data-action="key-del" data-id="${k.id}">删除</span>
        </div>
      </div>`;
  }).join('');
}

function openKeySheet() {
  overlay(`
    <div class="text-bold" style="font-size:15px;margin-bottom:10px">添加 AI 密钥</div>
    <div class="card" style="text-align:left">
      <select class="auth-input" id="keyProvider">
        ${PROVIDERS.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select>
      <input class="auth-input mt-2" id="keySecret" type="password"
             placeholder="API Key（sk-…）" autocomplete="off" />
      <input class="auth-input mt-2" id="keyBaseUrl" type="url"
             placeholder="Base URL，如 https://xxx/v1" hidden />
      <div class="auth-msg" id="keyMsg"></div>
    </div>
    <div class="action-bar mt-2">
      <button class="btn ghost block" data-close>取消</button>
      <button class="btn block" data-action="do-add-key">测试并保存</button>
    </div>`);

  const prov = $('#keyProvider');
  prov?.addEventListener('change', () => {
    const bu = $('#keyBaseUrl');
    if (bu) bu.hidden = prov.value !== 'custom';
  });
}

function keyMsg(text, bad = true) {
  const el = $('#keyMsg');
  if (!el) return;
  el.textContent = text || '';
  el.className = `auth-msg${text ? (bad ? ' bad' : ' ok') : ''}`;
}

async function submitKey() {
  const provider = $('#keyProvider')?.value;
  const api_key = ($('#keySecret')?.value || '').trim();
  const base_url = ($('#keyBaseUrl')?.value || '').trim();

  if (!api_key) { keyMsg('请粘贴 API Key'); return; }
  if (provider === 'custom' && !base_url) { keyMsg('自定义服务商需要填 Base URL'); return; }

  const meta = PROVIDERS.find(p => p.id === provider);
  keyMsg('正在测试连接…', false);

  try {
    await A.testKey({ provider, api_key, base_url, model: meta?.models?.[0] });
  } catch (e) {
    keyMsg(e.message || '连接失败');
    return;
  }

  try {
    const added = await A.addKey({ provider, api_key, base_url });
    // 落库后再跑一次「按 id 测试」，把状态从「未测试」刷成「可用」
    if (added?.id) await A.testKey({ id: added.id }).catch(() => {});
    await refreshKeys();
    renderKeys();
    updateModelPill();
    closeOverlay();
    toast('密钥已保存 ✓', 'success');
  } catch (e) {
    keyMsg(e.message || '保存失败');
  }
}

async function testKeyById(id) {
  toast('测试中…');
  try {
    const r = await A.testKey({ id });
    await refreshKeys();
    renderKeys();
    toast(`连接正常 ✓（${r.model}）`, 'success');
  } catch (e) {
    await refreshKeys();
    renderKeys();
    toast(e.message || '连接失败', 'danger');
  }
}

async function makeDefault(id) {
  try {
    await A.setDefault(id);
    await refreshKeys();
    renderKeys();
    updateModelPill();
    toast('已设为默认 ✓', 'success');
  } catch (e) { toast(e.message, 'danger'); }
}

async function removeKey(id) {
  if (!confirm('删除这个密钥？删除后如果没别的密钥，会回退到应用内置密钥。')) return;
  try {
    await A.deleteKey(id);
    await refreshKeys();
    renderKeys();
    updateModelPill();
    toast('已删除');
  } catch (e) { toast(e.message, 'danger'); }
}

/* ================= AI 调试台 ================= */
let chatHistory = [];
let streaming = false;

function bubble(role, html) {
  const area = $('#chatArea');
  if (!area) return null;
  const div = document.createElement('div');
  div.className = role === 'user' ? 'bubble-user' : 'bubble-ai';
  div.innerHTML = html;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

const md = (s) => esc(s).replace(/\n/g, '<br>');

const ACTIONS = `<div class="actions">
  <span data-action="copy-last">复制</span>
  <span data-action="clear-chat">清空</span>
</div>`;

async function sendMessage() {
  if (streaming) return;
  const input = $('#chatInput');
  const text = (input?.value || '').trim();
  if (!text) { toast('说点什么吧', 'warning'); return; }

  input.value = '';
  bubble('user', md(text));
  chatHistory.push({ role: 'user', content: text });

  const ai = bubble('ai', '思考中…');
  const sys = currentPrompt()?.system_prompt || '';
  const messages = sys
    ? [{ role: 'system', content: sys }, ...chatHistory]
    : [...chatHistory];

  streaming = true;
  let acc = '';
  try {
    await A.chatStream(messages, {
      model: state.model,
      temperature: 0.7,
      onDelta: (d) => {
        acc += d;
        if (ai) ai.innerHTML = md(acc);
        const area = $('#chatArea');
        if (area) area.scrollTop = area.scrollHeight;
      }
    });
    chatHistory.push({ role: 'assistant', content: acc });
    if (ai) ai.innerHTML = md(acc || '（模型没有返回内容）') + ACTIONS;
    await refreshStats();
    syncAll();
  } catch (e) {
    chatHistory.pop();
    if (ai) ai.innerHTML = `调用失败：${esc(e.message)}`;
  } finally {
    streaming = false;
  }
}

function usePrompt() {
  const p = currentPrompt();
  if (!p) { toast('先在编辑器里写一条并保存', 'warning'); go('editor'); return; }
  if (!$('#chatInput')) go('debug');
  setTimeout(() => {
    const input = $('#chatInput');
    if (input) input.value = p.user_prompt || '按你的设定，开始吧';
    sendMessage();
  }, 80);
}

function clearChat() {
  chatHistory = [];
  const area = $('#chatArea');
  if (area) {
    area.innerHTML = `<div class="bubble-ai">对话已清空。你的提示词会作为 System 指令自动带上。</div>`;
  }
  toast('已清空对话');
}

function updateModelPill() {
  const pill = $('#modelPill');
  if (pill) pill.innerHTML = `${state.model} <span class="text-muted">▾</span>`;
  const src = $('#keySource');
  if (src) {
    const k = activeKey();
    src.textContent = k ? `用你的密钥 · ${providerName(k.provider)}` : '用应用内置密钥';
    src.className = `text-xs ${k ? 'text-success' : 'text-muted'}`;
  }
}

function cycleModel() {
  const ms = availableModels();
  const i = ms.findIndex(m => m.id === state.model);
  state.model = ms[(i + 1) % ms.length].id;
  updateModelPill();
  toast(`已切换到 ${state.model}`);
}

/* ================= 扭蛋机 ================= */
let drawing = false;
async function drawGacha() {
  if (drawing) return;
  drawing = true;

  const machine = $('.gacha-machine');
  if (machine) {
    [...machine.children].forEach((b, i) => {
      b.animate([
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${(Math.random() - .5) * 70}px, -${40 + Math.random() * 60}px) scale(1.25)` },
        { transform: 'translate(0,0) scale(1)' }
      ], { duration: 700, delay: i * 90, iterations: 2, easing: 'ease-in-out' });
    });
  }

  try {
    const r = await A.drawGacha();
    state.user.credits = r.credits;
    const rare = r.rarity !== '普通';
    overlay(`
      <div class="text-center" style="margin-bottom:12px">
        <div class="text-sm text-muted">恭喜抽到</div>
        <div style="font-size:16px;font-weight:700;margin-top:6px">
          <span class="${rare ? 'text-warning' : 'text-primary'}">${esc(r.rarity)}</span> · 灵感提示词
        </div>
      </div>
      <div class="card" style="text-align:left">
        <div class="text-sm" style="line-height:1.7">${esc(r.prize)}</div>
      </div>
      <div class="text-xs text-muted mt-2">剩余灵感值 ${nfmt(r.credits)}</div>
      <div class="action-bar mt-2">
        <button class="btn ghost block" data-close>再抽一次</button>
        <button class="btn block" data-action="save-prize" data-text="${esc(r.prize)}">保存到素材库</button>
      </div>`);
    syncAll();
  } catch (e) {
    toast(e.message, 'danger');
  } finally {
    drawing = false;
  }
}

async function showGachaHistory() {
  try {
    const r = await A.getGachaLogs();
    const logs = r.logs || [];
    overlay(`
      <div class="text-bold" style="font-size:15px;margin-bottom:10px">最近 ${logs.length} 次抽卡</div>
      ${logs.length ? logs.map(l => `
        <div class="card mt-2" style="text-align:left">
          <div class="text-xs ${l.rarity === '普通' ? 'text-muted' : 'text-warning'}">${esc(l.rarity)} · ${relTime(l.created_at)}</div>
          <div class="text-sm mt-1" style="line-height:1.6">${esc(l.prize)}</div>
        </div>`).join('')
        : '<div class="text-sm text-muted">还没有抽过卡</div>'}
      <button class="btn block mt-3" data-close>关闭</button>`);
  } catch (e) { toast(e.message, 'danger'); }
}

/* ================= Bingo ================= */
function paintBingo() {
  $$('#bingoGrid .bingo-cell').forEach(c => {
    if (c.classList.contains('free')) return;
    const on = !!state.bingo[+c.dataset.cell];
    c.classList.toggle('done', on);
    c.classList.toggle('undone', !on);
    c.textContent = on ? '✓' : '';
  });
}

async function toggleBingo(cell) {
  if (cell.classList.contains('free')) { toast('这是免费格 🎁'); return; }
  const i = +cell.dataset.cell;
  state.bingo[i] = state.bingo[i] ? 0 : 1;
  paintBingo();
  setText('[data-stat="bingoDone"]', bingoDone());
  setText('[data-stat="bingoLines"]', bingoLines());
  try { await A.saveBingo(state.bingo); } catch { toast('保存失败，稍后重试', 'danger'); }
}

async function resetBingo() {
  if (!confirm('重置本月的打卡进度？')) return;
  state.bingo = Array(25).fill(0);
  paintBingo();
  setText('[data-stat="bingoDone"]', 0);
  setText('[data-stat="bingoLines"]', 0);
  try { await A.saveBingo(state.bingo); toast('已重置'); } catch { toast('重置失败', 'danger'); }
}

/* ================= 竞技场 ================= */
const BASELINE = {
  system_prompt: '',
  user_prompt: '帮我写一段产品介绍。'
};

const JUDGE_SYS = `你是一位严格的提示词评审专家。请评估下面这条提示词的综合质量，维度包括：角色设定、任务清晰度、输出格式约束、可复用性。
严格按以下两行格式输出，不要输出任何多余内容：
分数: <0 到 10 之间的数字，保留一位小数>
评语: <一句话，不超过 40 个字>`;

async function judge(p) {
  const content = [p.system_prompt, p.user_prompt].filter(Boolean).join('\n');
  const res = await A.chatOnce(
    [{ role: 'system', content: JUDGE_SYS },
     { role: 'user', content: '待评审提示词：\n' + content }],
    state.model, 0.2
  );
  const t = res?.choices?.[0]?.message?.content || '';
  return {
    score: parseFloat((t.match(/分数\s*[:：]\s*([\d.]+)/) || [])[1] ?? '') || 7,
    comment: ((t.match(/评语\s*[:：]\s*(.+)/) || [])[1] || '').trim().slice(0, 60)
  };
}

async function arenaPlay(btn) {
  const p = currentPrompt();
  if (!p) { toast('先在编辑器里写一条提示词并保存', 'warning'); go('editor'); return; }

  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '裁判打分中…'; }
  try {
    const [mine, ai] = await Promise.all([judge(p), judge(BASELINE)]);
    const win = mine.score > ai.score;

    $$('[data-arena="my"]').forEach(e => e.textContent = mine.score.toFixed(1));
    $$('[data-arena="ai"]').forEach(e => e.textContent = ai.score.toFixed(1));
    $$('[data-arena="myTag"]').forEach(e => { e.textContent = win ? '胜' : '负'; e.className = `text-xs text-bold ${win ? 'text-success' : 'text-danger'}`; });
    $$('[data-arena="aiTag"]').forEach(e => { e.textContent = win ? '负' : '胜'; });
    $$('[data-arena="verdict"]').forEach(e => {
      e.textContent = `${mine.comment || '（无评语）'}｜你的 ${mine.score.toFixed(1)} 分 vs 基线 ${ai.score.toFixed(1)} 分，${win ? '本局你胜出 +20 灵感值' : '再打磨一下提示词吧'}`;
    });

    const r = await A.saveArena(mine.score, ai.score);
    state.user.credits = r.credits;
    await refreshStats();
    syncAll();
    toast(win ? '本局胜出 +20 灵感值 🎉' : '本局惜败，再改改提示词', win ? 'success' : 'warning');
  } catch (e) {
    toast('对战失败：' + e.message, 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label || '再来一局'; }
  }
}

/* ================= 统计分析 ================= */
const COLORS = ['#4F8CFF', '#9B6DFF', '#34D399', '#FBBF24', '#F87171'];

function last7() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function renderStats() {
  const s = state.stats;
  if (!s) return;

  const days = last7();
  const map = Object.fromEntries((s.daily || []).map(d => [d.day, d]));
  const calls = days.map(d => map[d]?.calls || 0);
  const tks = days.map(d => map[d]?.tokens || 0);

  const W = 326, H = 92;
  const line = (arr, color, sw) => {
    const max = Math.max(1, ...arr);
    const step = arr.length > 1 ? (W - 12) / (arr.length - 1) : 0;
    const pts = arr.map((v, i) => `${6 + i * step},${(H - 10 - (v / max) * (H - 24)).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  };

  const tc = $('#trendChart');
  if (tc) tc.innerHTML = `<svg width="100%" height="92" viewBox="0 0 ${W} ${H}" fill="none" preserveAspectRatio="none">
    ${line(calls, '#4F8CFF', 2.4)}${line(tks, '#9B6DFF', 2)}</svg>`;

  const models = s.models || [];
  const total = models.reduce((a, b) => a + b.calls, 0) || 1;
  const C = 2 * Math.PI * 40;
  let off = 0, segs = `<circle cx="55" cy="55" r="40" stroke="#2A2E37" stroke-width="17"/>`;
  models.forEach((m, i) => {
    const len = (m.calls / total) * C;
    segs += `<circle cx="55" cy="55" r="40" stroke="${COLORS[i % 5]}" stroke-width="17"
      stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}"
      transform="rotate(-90 55 55)"/>`;
    off += len;
  });
  const dw = $('#donutWrap');
  if (dw) dw.innerHTML = `<svg width="110" height="110" viewBox="0 0 110 110" fill="none">${segs}</svg>`;

  const lg = $('#modelLegend');
  if (lg) lg.innerHTML = `<div class="text-sm text-bold">模型使用占比</div>` +
    (models.length
      ? models.map((m, i) => `<div class="text-xs" style="color:${COLORS[i % 5]}">${esc(m.model)}&nbsp;&nbsp;${Math.round(m.calls / total * 100)}%</div>`).join('')
      : '<div class="text-xs text-muted">暂无数据</div>');

  const tb = $('#tokenBars');
  if (tb) {
    const max = Math.max(1, ...tks);
    tb.innerHTML = tks.map(v => `<div class="bar" style="height:${Math.round(8 + (v / max) * 66)}px"></div>`).join('');
  }

  const p = s.totals?.p_tokens || 0, c = s.totals?.c_tokens || 0;
  setText('[data-stat="cost"]', `¥ ${((p * 0.8 + c * 2) / 1000000).toFixed(2)}`);

  const rl = $('#recentLogs');
  if (rl) {
    const rec = s.recent || [];
    rl.innerHTML = rec.length
      ? rec.map(r => `<div class="row between text-xs"><span class="text-muted">${esc(String(r.created_at).slice(5, 16))} · ${esc(r.model || '')}</span><span>${r.prompt_tokens} / ${r.completion_tokens} · <span class="${r.status === 'ok' ? 'text-success' : 'text-danger'}">${r.status === 'ok' ? '成功' : esc(r.status)}</span></span></div>`).join('<div style="height:8px"></div>')
      : '<div class="text-xs text-muted">还没有调用记录，去调试台试试</div>';
  }
}

/* ================= 沙雕生成器（词库来自后端） ================= */
const sillyState = { slots: ['', '', ''], hot: [], mine: [] };

function renderSillySlots() {
  ['主体', '任务', '风格'].forEach((label, i) => {
    const el = $(`.silly-slot[data-slot="${i}"] .value`);
    if (el) el.textContent = sillyState.slots[i] || '（词库加载中）';
  });
  updateSilly();
}

function updateSilly() {
  const v = sillyState.slots;
  const el = $('#sillyResult');
  if (el && v.every(Boolean)) el.textContent = `请让${v[0]}，${v[1]}，文风${v[2]}。`;
}

async function loadSilly() {
  try {
    const d = await A.getSilly();
    sillyState.slots = (d.slots || []).length === 3 ? d.slots : sillyState.slots;
    sillyState.hot = d.hot || [];
    sillyState.mine = d.mine || [];
  } catch (e) {
    toast('词库加载失败：' + e.message, 'danger');
  }
  renderSillySlots();
  renderSillyHot();
}

function renderSillyHot() {
  const box = $('#sillyHot');
  if (!box) return;
  const rows = sillyState.hot.length ? sillyState.hot : sillyState.mine;
  box.innerHTML = rows.length
    ? rows.map(p => `
        <div class="list-item mt-2" style="height:auto;padding:12px;align-items:flex-start">
          <div class="col gap-1 flex-1">
            <span class="text-sm">${esc(p.body)}</span>
            <span class="text-xs text-muted">★ ${p.likes || 0}${p.nickname ? ' · ' + esc(p.nickname) : ''}</span>
          </div>
          <button class="btn ghost" style="height:30px;padding:0 10px;font-size:12px"
                  data-action="silly-like" data-id="${p.id}">点赞</button>
        </div>`).join('')
    : '<div class="text-xs text-muted">还没有沙雕作品，合成一条发布试试</div>';
}

/** 重新抽词：只换指定槽位，其余保持 */
async function rerollSlot(i) {
  try {
    const d = await A.getSilly();
    const s = d.slots || [];
    if (s.length !== 3) return;
    if (i === 'all') sillyState.slots = s;
    else {
      const cur = sillyState.slots[i];
      sillyState.slots[i] = s.find(x => x !== cur) || s[i];
    }
  } catch (e) {
    toast('换词失败：' + e.message, 'danger');
    return;
  }
  renderSillySlots();
}

async function publishSilly() {
  const text = $('#sillyResult')?.textContent?.trim();
  if (!text || text.length < 4) { toast('先合成一条 Prompt', 'danger'); return; }
  try {
    await A.postSilly(text);
    toast('已发布到热门榜 ✓', 'success');
    await loadSilly();
  } catch (e) { toast(e.message, 'danger'); }
}

/* ================= 成就徽章墙 ================= */
const badgeState = { all: [], cat: 'all' };

async function loadBadges(cat = badgeState.cat) {
  badgeState.cat = cat;
  $$('[data-badge-cat]').forEach(el => {
    const on = el.dataset.badgeCat === cat;
    el.className = `text-sm ${on ? 'text-primary text-bold' : 'text-muted'}`;
  });
  try {
    const d = await A.getBadges();
    badgeState.all = d.badges || [];
    const sum = $('#badgeSummary');
    if (sum) sum.textContent = `已解锁 ${d.unlocked} / ${d.total} 枚徽章`;
    const bar = $('#badgeBar');
    if (bar) bar.style.width = `${Math.round((d.unlocked / Math.max(1, d.total)) * 100)}%`;
    renderBadgeLatest(d.new_unlocked || []);
  } catch (e) {
    const g = $('#badgeGrid');
    if (g) g.innerHTML = `<div class="text-xs text-danger">加载失败：${esc(e.message)}</div>`;
    return;
  }
  renderBadges();
}

function renderBadgeLatest(newOnes) {
  const el = $('#badgeLatest');
  if (!el) return;
  if (!newOnes.length) {
    el.textContent = '暂无新解锁，继续做任务吧';
    return;
  }
  const names = newOnes
    .map(id => badgeState.all.find(b => b.id === id)?.name || id)
    .join(' · ');
  el.innerHTML = `<span class="text-success">刚刚解锁：${esc(names)}</span>`;
}

function renderBadges() {
  const box = $('#badgeGrid');
  if (!box) return;
  const list = badgeState.cat === 'all'
    ? badgeState.all
    : badgeState.all.filter(b => b.cat === badgeState.cat);
  if (!list.length) { box.innerHTML = '<div class="text-xs text-muted">这个分类还没有徽章</div>'; return; }

  const color = { 成长: 'var(--success)', 趣味: 'var(--secondary)', 竞技: 'var(--danger)', 限定: 'var(--primary)' };
  let html = '';
  for (let i = 0; i < list.length; i += 3) {
    html += '<div class="badge-row">' + list.slice(i, i + 3).map(b => `
      <div class="badge-tile${b.legendary && b.unlocked ? ' legendary' : ''}${b.unlocked ? '' : ' locked'}"
           data-action="toast" data-msg="${esc(b.name)}：${esc(b.cond)}">
        <span class="badge-icon" style="background:${b.unlocked ? (color[b.cat] || 'var(--primary)') : 'var(--border)'}"></span>${esc(b.name)}
      </div>`).join('') + '</div>';
  }
  box.innerHTML = html;
}

/* ================= 每日锦鲤 / 打卡 ================= */
const koiState = { card: null, calendar: [], credits: 0, streak: 0 };

async function loadKoi() {
  try {
    const d = await A.getKoi();
    koiState.card = d.card;
    koiState.calendar = d.calendar || [];
    koiState.credits = d.credits;
    koiState.streak = d.streak || 0;
    if (state.user) state.user.streak = koiState.streak;
  } catch (e) {
    const box = $('#koiCard');
    if (box) box.innerHTML = `<div class="koi-card"><span class="label">加载失败</span>
      <div style="font-size:14px;color:var(--danger)">${esc(e.message)}</div></div>`;
    return;
  }
  renderKoi();
  setText('[data-stat="streak"]', String(koiState.streak));
}

function renderKoi() {
  const box = $('#koiCard');
  const c = koiState.card;
  if (box && c) {
    box.innerHTML = `
      <div class="koi-card">
        <span class="label">今日锦鲤 · ${new Date().toLocaleDateString('zh-CN')}</span>
        <div style="font-size:14px;line-height:1.7;color:var(--text)">${esc(c.body)}</div>
        <span class="fortune">${esc(c.fortune)}</span>
      </div>`;
  }
  renderCalendar();
}

function renderCalendar() {
  const box = $('#koiCalendar');
  if (!box) return;
  const set = new Set(koiState.calendar.map(c => c.day));
  const makeup = new Set(koiState.calendar.filter(c => c.makeup).map(c => c.day));
  const days = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  box.innerHTML = days.map(day => {
    const done = set.has(day);
    const cls = done ? (makeup.has(day) ? 'check' : 'check') : 'miss';
    const num = Number(day.slice(8));
    return `<div class="calendar-day ${done ? 'check' : 'miss'}"
      ${done ? '' : `data-action="koi-makeup" data-day="${day}"`}
      title="${done ? '已打卡' : '点击补签（-20）'}">${num}</div>`;
  }).join('');
}

async function doCheckin() {
  try {
    const r = await A.checkIn();
    koiState.streak = r.streak;
    setText('[data-stat="streak"]', String(r.streak));
    toast(`打卡成功，连续 ${r.streak} 天 ✓`, 'success');
    await loadKoi();
    refreshStats().then(syncAll).catch(() => {});
  } catch (e) { toast(e.message, 'danger'); }
}

async function doMakeup(day) {
  try {
    const r = await A.makeupDay(day);
    koiState.streak = r.streak;
    setText('[data-stat="streak"]', String(r.streak));
    toast(`已补签 ${day}，连续 ${r.streak} 天`, 'success');
    await loadKoi();
    refreshStats().then(syncAll).catch(() => {});
  } catch (e) { toast(e.message, 'danger'); }
}

/* ================= 翻车现场墙 ================= */
const failState = { posts: [], liked: [], sort: 'new' };

async function loadFails(sort = failState.sort) {
  failState.sort = sort;
  $$('[data-fail-sort]').forEach(el => {
    const on = el.dataset.failSort === sort;
    el.className = `text-sm ${on ? 'text-primary text-bold' : 'text-muted'}`;
  });
  const box = $('#failList');
  try {
    const d = await A.getFails(sort);
    failState.posts = d.posts || [];
    failState.liked = d.liked || [];
  } catch (e) {
    if (box) box.innerHTML = `<div class="text-xs text-danger">加载失败：${esc(e.message)}</div>`;
    return;
  }
  renderFails();
}

function renderFails() {
  const box = $('#failList');
  if (!box) return;
  if (!failState.posts.length) {
    box.innerHTML = '<div class="text-xs text-muted">还没有人投稿，来当第一个吧</div>';
    return;
  }
  box.innerHTML = failState.posts.map(p => {
    const liked = failState.liked.includes(p.id);
    return `
      <div class="card fail-card">
        <div class="text-xs text-muted">${esc(p.nickname || '匿名')} · ${esc(String(p.created_at).slice(5, 16))}</div>
        <div class="text-sm text-bold mt-2">Prompt：${esc(p.prompt)}</div>
        <div class="result mt-2">结果：${esc(p.result)}</div>
        ${p.remark ? `<div class="text-xs text-muted mt-2">吐槽：${esc(p.remark)}</div>` : ''}
        <div class="foot">
          <span data-action="fail-like" data-id="${p.id}"
                style="color:${liked ? 'var(--primary)' : 'inherit'}">${liked ? '已赞' : '赞'} ${p.likes || 0}</span>
        </div>
      </div>`;
  }).join('');
}

function failSubmitSheet() {
  overlay(`
    <div class="text-bold" style="margin-bottom:12px">投稿翻车现场</div>
    <textarea class="input" id="fsPrompt" rows="2" placeholder="你写的 Prompt"></textarea>
    <textarea class="input mt-2" id="fsResult" rows="3" placeholder="AI 的实际输出"></textarea>
    <input class="input mt-2" id="fsRemark" placeholder="一句话吐槽（选填，最多 50 字）" maxlength="50" />
    <button class="btn block mt-3" data-action="do-fail-submit">提交</button>
    <button class="btn ghost block mt-2" data-close>取消</button>`);
}

async function submitFail() {
  const prompt = $('#fsPrompt')?.value.trim();
  const result = $('#fsResult')?.value.trim();
  const remark = $('#fsRemark')?.value.trim();
  if (!prompt || !result) { toast('Prompt 和结果都要填', 'danger'); return; }
  try {
    await A.postFail({ prompt, result, remark });
    closeOverlay();
    toast('投稿成功 ✓', 'success');
    await loadFails();
  } catch (e) { toast(e.message, 'danger'); }
}

/* ================= 社区广场 ================= */
const commState = { posts: [], liked: [], faved: [], sort: 'new', q: '' };

async function loadCommunity(sort = commState.sort, q = commState.q) {
  commState.sort = sort; commState.q = q;
  $$('[data-comm-sort]').forEach(el => {
    const on = el.dataset.commSort === sort;
    el.className = `text-sm ${on ? 'text-primary text-bold' : 'text-muted'}`;
  });
  const box = $('#communityList');
  try {
    const d = await A.getCommunity(sort, q);
    commState.posts = d.posts || [];
    commState.liked = d.liked || [];
    commState.faved = d.faved || [];
  } catch (e) {
    if (box) box.innerHTML = `<div class="text-xs text-danger">加载失败：${esc(e.message)}</div>`;
    return;
  }
  renderCommunity();
}

function renderCommunity() {
  const box = $('#communityList');
  if (!box) return;
  if (!commState.posts.length) {
    box.innerHTML = '<div class="text-xs text-muted">还没有作品，点右上角发布一篇</div>';
    return;
  }
  box.innerHTML = commState.posts.map(p => {
    const liked = commState.liked.includes(p.id);
    const faved = commState.faved.includes(p.id);
    return `
      <div class="card post-card">
        <div class="text-xs text-muted">${esc(p.nickname || '匿名')} · ${esc(String(p.created_at).slice(5, 16))}</div>
        <div class="title mt-2">${esc(p.title)}</div>
        <div class="preview">${esc(String(p.content).slice(0, 90))}…</div>
        ${p.tags ? `<div class="text-xs text-muted mt-2">${esc(p.tags)}</div>` : ''}
        <div class="foot row gap-3">
          <span data-action="community-like" data-id="${p.id}"
                style="color:${liked ? 'var(--primary)' : 'inherit'}">${liked ? '已赞' : '赞'} ${p.likes || 0}</span>
          <span data-action="community-fav" data-id="${p.id}"
                style="color:${faved ? 'var(--warning)' : 'inherit'}">${faved ? '已收藏' : '收藏'} ${p.favs || 0}</span>
          <span data-action="community-open" data-id="${p.id}">详情 ›</span>
        </div>
      </div>`;
  }).join('');
}

function communityPublishSheet() {
  overlay(`
    <div class="text-bold" style="margin-bottom:12px">发布到社区（+30 灵感值）</div>
    <input class="input" id="cpTitle" placeholder="标题" maxlength="60" />
    <textarea class="input mt-2" id="cpContent" rows="5" placeholder="完整 Prompt 内容"></textarea>
    <input class="input mt-2" id="cpTags" placeholder="标签，逗号分隔，如：文案,营销" maxlength="80" />
    <input class="input mt-2" id="cpEffect" placeholder="效果说明（选填）" maxlength="300" />
    <button class="btn block mt-3" data-action="do-community-publish">发布</button>
    <button class="btn ghost block mt-2" data-close>取消</button>`);
}

async function submitCommunity() {
  const title = $('#cpTitle')?.value.trim();
  const content = $('#cpContent')?.value.trim();
  const tags = $('#cpTags')?.value.trim();
  const effect = $('#cpEffect')?.value.trim();
  if (!title || !content) { toast('标题和内容都要填', 'danger'); return; }
  try {
    await A.postCommunity({ title, content, tags, effect });
    closeOverlay();
    toast('发布成功，+30 灵感值 ✓', 'success');
    await loadCommunity();
    refreshStats().then(syncAll).catch(() => {});
  } catch (e) { toast(e.message, 'danger'); }
}

async function openCommunityPost(id) {
  const p = commState.posts.find(x => x.id === Number(id));
  if (!p) return;
  let comments = [];
  try { comments = (await A.getComments(p.id)).comments || []; } catch { /* 忽略 */ }
  overlay(`
    <div class="text-bold">${esc(p.title)}</div>
    <div class="text-xs text-muted mt-1">${esc(p.nickname || '匿名')} · ${esc(String(p.created_at).slice(5, 16))}</div>
    <div class="card mt-3" style="max-height:260px;overflow:auto">
      <div style="font-size:13px;line-height:1.7">${esc(p.content)}</div>
      ${p.effect ? `<div class="text-xs text-muted mt-2">效果：${esc(p.effect)}</div>` : ''}
    </div>
    <div class="row gap-2 mt-3">
      <button class="btn ghost flex-1" data-action="community-use" data-id="${p.id}">一键使用</button>
      <button class="btn flex-1" data-action="community-like" data-id="${p.id}">点赞 ${p.likes || 0}</button>
    </div>
    <div class="group-title">评论（${comments.length}）</div>
    ${comments.map(c => `<div class="text-xs mt-2"><span class="text-muted">${esc(c.nickname)}：</span>${esc(c.content)}</div>`).join('')
      || '<div class="text-xs text-muted">还没有评论</div>'}
    <div class="row gap-2 mt-3">
      <input class="input flex-1" id="cmtInput" placeholder="说点什么…" maxlength="200" />
      <button class="btn" data-action="do-comment" data-id="${p.id}">发送</button>
    </div>
    <button class="btn ghost block mt-2" data-close>关闭</button>`);
}

async function submitComment(id) {
  const v = $('#cmtInput')?.value.trim();
  if (!v) { toast('评论不能为空', 'danger'); return; }
  try {
    await A.postComment(id, v);
    toast('评论已发送 ✓', 'success');
    await openCommunityPost(id);
  } catch (e) { toast(e.message, 'danger'); }
}

async function useCommunityPost(id) {
  const p = commState.posts.find(x => x.id === Number(id));
  if (!p) return;
  closeOverlay();
  try {
    await A.createPrompt({
      title: p.title, system_prompt: '', user_prompt: p.content,
      variables: {}, model: state.model
    });
    await refreshPrompts();
    toast('已存入我的素材库 ✓', 'success');
    go('library');
  } catch (e) { toast(e.message, 'danger'); }
}

/* ================= 灵感值流水 ================= */
async function loadCredits() {
  try {
    const d = await A.getCredits();
    const b = $('#creditsBalance');
    if (b) b.textContent = String(d.balance ?? 0);
    const box = $('#creditsList');
    if (!box) return;
    const logs = d.logs || [];
    box.innerHTML = logs.length
      ? logs.map(l => `
          <div class="list-item" style="height:auto;padding:12px">
            <div class="col gap-1 flex-1">
              <span class="text-sm">${esc(l.reason || '系统调整')}</span>
              <span class="text-xs text-muted">${esc(String(l.created_at).slice(0, 16))}</span>
            </div>
            <span class="text-bold" style="color:${l.amount >= 0 ? 'var(--success)' : 'var(--danger)'}">
              ${l.amount >= 0 ? '+' : ''}${l.amount}
            </span>
          </div>`).join('')
      : '<div class="text-xs text-muted">还没有流水记录</div>';
  } catch (e) {
    toast('加载失败：' + e.message, 'danger');
  }
}

/* ================= 设置（云端同步） ================= */
const settingsState = { theme: 'dark', font_size: 'medium', default_model: 'qwen-turbo', language: 'zh-CN', notify: 1 };

async function loadSettings() {
  try {
    const d = await A.getSettings();
    Object.assign(settingsState, d.settings || {});
  } catch { /* 用默认值 */ }
  $$('[data-set-font]').forEach(el => {
    const on = el.dataset.setFont === settingsState.font_size;
    el.className = `chip${on ? ' active' : ''}`;
  });
  const nl = $('#setNotifyLabel');
  if (nl) nl.textContent = settingsState.notify ? '开' : '关';
}

async function saveSettings(patch) {
  Object.assign(settingsState, patch);
  try { await A.saveSettings(patch); }
  catch (e) { toast('保存失败：' + e.message, 'danger'); return; }
  toast('已保存到云端 ✓', 'success');
  loadSettings();
}

/* ================= 数据导出 ================= */
async function exportData() {
  try {
    const d = await A.exportData();
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-studio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('已导出 JSON ✓', 'success');
  } catch (e) { toast('导出失败：' + e.message, 'danger'); }
}

/* ================= 竞技场排行榜 ================= */
async function showArenaBoard() {
  try {
    const d = await A.getArenaBoard();
    const h = await A.getArenaHistory();
    const mine = d.mine || { matches: 0, wins: 0, points: 0 };
    overlay(`
      <div class="text-bold">本周竞技场</div>
      <div class="card mt-3">
        <div class="row between text-sm"><span>我的战绩</span>
          <span class="text-primary text-bold">${mine.points} 分</span></div>
        <div class="text-xs text-muted mt-2">${mine.matches} 场 · 胜 ${mine.wins || 0} 场</div>
      </div>
      <div class="group-title">排行榜 TOP 10</div>
      ${(d.board || []).map((r, i) => `
        <div class="list-item mt-2">
          <span>${i + 1}. ${esc(r.nickname || '匿名')}<span class="text-xs text-muted"> · ${r.matches}场 胜${r.wins || 0}</span></span>
          <span class="text-bold">${r.points}</span>
        </div>`).join('') || '<div class="text-xs text-muted">本周还没有人参赛</div>'}
      <div class="group-title">最近战绩</div>
      ${(h.logs || []).map(l => `
        <div class="list-item mt-2">
          <span class="text-xs text-muted">${esc(String(l.created_at).slice(5, 16))}</span>
          <span>我 ${l.my_score} : ${l.ai_score} AI</span>
        </div>`).join('') || '<div class="text-xs text-muted">还没有对战记录</div>'}
      <button class="btn ghost block mt-3" data-close>关闭</button>`);
  } catch (e) { toast('加载失败：' + e.message, 'danger'); }
}

/* ================= 批量测试 ================= */
async function runBatchTest() {
  const btn = $('#btRun');
  const box = $('#btResult');
  const lines = (id) => ($(id)?.value || '').split('\n').map(s => s.trim()).filter(Boolean);

  const versions = [
    { label: 'V1', system: $('#btV1Sys')?.value || '', user: $('#btV1User')?.value || '' },
    { label: 'V2', system: $('#btV2Sys')?.value || '', user: $('#btV2User')?.value || '' }
  ].filter(v => v.user.trim());

  if (!versions.length) { toast('至少填一个版本的用户提示', 'danger'); return; }

  const variables = {
    product: lines('#btVarProduct'),
    style: lines('#btVarStyle')
  };

  if (btn) { btn.disabled = true; btn.textContent = '正在跑…（最多 8 次调用）'; }
  if (box) box.innerHTML = '<div class="text-xs text-muted">正在调用模型并让 AI 裁判打分，请稍候…</div>';

  try {
    const r = await A.runBatch({ name: '批量测试', versions, variables, model: state.model });
    const groups = {};
    (r.results || []).forEach(x => {
      (groups[x.version] = groups[x.version] || []).push(x);
    });
    if (box) {
      box.innerHTML = `
        <div class="test-table text-muted">版本&nbsp;&nbsp;&nbsp;&nbsp;组合&nbsp;&nbsp;&nbsp;&nbsp;AI评分&nbsp;&nbsp;&nbsp;耗时&nbsp;&nbsp;&nbsp;片段</div>
        ${Object.entries(groups).map(([v, arr]) => arr.map(x => `
          <div class="test-table" style="font-size:11px">
            ${esc(v)}&nbsp;&nbsp;&nbsp;${esc(Object.values(x.vars || {}).join('/') || '—')}&nbsp;&nbsp;&nbsp;
            <span class="${(x.score ?? 0) >= 7 ? 'text-success' : 'text-warning'}">${x.score ?? '—'}</span>&nbsp;&nbsp;&nbsp;
            ${esc(String(x.output || '').slice(0, 24))}…
          </div>`).join('')).join('')}
        <div class="text-xs text-muted mt-2">模型：${esc(r.model)} · 结果已存云端</div>`;
    }
    toast(`完成，共 ${(r.results || []).length} 组`, 'success');
    refreshStats().then(syncAll).catch(() => {});
  } catch (e) {
    if (box) box.innerHTML = `<div class="text-xs text-danger">${esc(e.message)}</div>`;
    toast(e.message, 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '开始批量测试'; }
  }
}

async function showBatchHistory() {
  try {
    const d = await A.getBatchRuns();
    const runs = d.runs || [];
    overlay(`
      <div class="text-bold">历史批量测试</div>
      ${runs.map(r => `
        <div class="list-item mt-2" data-action="batch-open" data-id="${r.id}">
          <div class="col gap-1">
            <span class="text-sm">${esc(r.name || '批量测试')}</span>
            <span class="text-xs text-muted">${esc(String(r.created_at).slice(0, 16))} · ${esc(r.model || '')}</span>
          </div>
          <span class="text-muted">›</span>
        </div>`).join('') || '<div class="text-xs text-muted mt-3">还没有历史记录</div>'}
      <button class="btn ghost block mt-3" data-close>关闭</button>`);
  } catch (e) { toast('加载失败：' + e.message, 'danger'); }
}

/* ================= 安装到桌面 ================= */
let deferredInstall = null;
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast('安装成功 🎉', 'success'); });

function installSheet(title, steps) {
  overlay(`
    <div class="text-center" style="margin-bottom:14px">
      <div style="font-size:16px;font-weight:700">${title}</div>
      <div class="text-sm text-muted" style="margin-top:4px">添加到主屏后，断网也能用</div>
    </div>
    <div class="card">
      ${steps.map((s, i) => `
        <div class="row gap-3" style="align-items:flex-start;${i ? 'margin-top:10px' : ''}">
          <span class="badge" style="min-width:20px">${i + 1}</span>
          <span class="text-sm flex-1" style="line-height:1.6">${s}</span>
        </div>`).join('')}
    </div>
    <button class="btn block mt-3" data-close>知道啦</button>`);
}

function promptInstall() {
  if (isStandalone()) { toast('已经是桌面应用啦 ✓', 'success'); return; }
  if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; return; }
  if (isIOS()) {
    installSheet('在 iPhone 上安装（Safari）', [
      '用 <b>Safari</b> 打开 <b>https://pwa.jdhsf.top</b><br><span class="text-xs text-muted">微信里打开的不行，先点右上角「⋯ → 在 Safari 中打开」</span>',
      '点底部中间的<b>分享按钮</b>（方框 + 向上箭头）',
      '在列表里下滑，选<b>「添加到主屏幕」</b>',
      '右上角「添加」，桌面出现图标即完成'
    ]);
  } else {
    installSheet('在安卓上安装（Chrome）', [
      '用 <b>Chrome</b> 打开 <b>https://pwa.jdhsf.top</b>',
      '点右上角<b>「⋮」菜单</b>',
      '选<b>「安装应用」</b>或<b>「添加到主屏幕」</b>',
      '确认后桌面出现图标，自动开始离线缓存'
    ]);
  }
}

/* ================= 交互委托 ================= */
document.addEventListener('click', async (e) => {
  if (e.target === overlayEl) { closeOverlay(); return; }
  if (e.target.closest('[data-close]')) { closeOverlay(); return; }

  // 登录页按钮
  if (e.target.closest('#authSubmit')) { submitAuth(); return; }
  if (e.target.closest('#authSendCode')) { sendCodeFlow(); return; }
  if (e.target.closest('#authToggle')) {
    setAuthMode(authMode === 'code' ? 'password' : 'code');
    return;
  }

  // 分段控件（纯视觉）
  const seg = e.target.closest('.editor-tab, .chip, .pool-tab');
  if (seg && !seg.dataset.action) {
    [...seg.parentElement.children].forEach(c => c.classList.remove('active'));
    seg.classList.add('active');
  }

  // 需要重新拉数据的筛选控件
  const bcat = e.target.closest('[data-badge-cat]');
  if (bcat) { loadBadges(bcat.dataset.badgeCat); return; }
  const fsort = e.target.closest('[data-fail-sort]');
  if (fsort) { loadFails(fsort.dataset.failSort); return; }
  const csort = e.target.closest('[data-comm-sort]');
  if (csort) { loadCommunity(csort.dataset.commSort); return; }
  const fontBtn = e.target.closest('[data-set-font]');
  if (fontBtn) { saveSettings({ font_size: fontBtn.dataset.setFont }); return; }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  let { action, msg, target, color, id } = el.dataset;

  if (action.startsWith('go:')) { target = action.slice(3); action = 'go'; }

  switch (action) {
    case 'go':          go(target); break;
    case 'back':        history.length > 1 ? history.back() : go('workbench'); break;
    case 'toast':       toast(msg); break;
    case 'theme':       setTheme(color); toast(`主题色已切换 ${color}`); break;
    case 'install':     promptInstall(); break;
    case 'logout':      doLogout(); break;

    case 'key-add':     openKeySheet(); break;
    case 'do-add-key':  submitKey(); break;
    case 'key-test':    testKeyById(Number(id)); break;
    case 'key-default': makeDefault(Number(id)); break;
    case 'key-del':     removeKey(Number(id)); break;

    case 'auth-mode':   setAuthMode(el.dataset.mode); break;
    case 'password-sheet': openPasswordSheet(false); break;
    case 'do-set-password': submitSetPassword(); break;

    case 'new-prompt':  newPrompt(); break;
    case 'save-prompt': savePrompt(); break;
    case 'role-pick':        openRoleSheet(); break;
    case 'role-apply':       applyEditorRole(el.dataset.role); break;
    case 'editor-more':      openEditorMore(); break;
    case 'editor-copy':      copyText(buildPreview() || ''); closeOverlay(); break;
    case 'editor-export':    exportEditorTxt(); break;
    case 'editor-versions':  editorVersionsSheet(); break;
    case 'version-preview': {
      const v = state.__lastVersions?.find(x => x.version === Number(el.dataset.version));
      if (v) versionPreviewSheet(v);
      break;
    }
    case 'version-restore':  restoreEditorVersion(Number(el.dataset.version)); break;
    case 'del-prompt':  e.stopPropagation(); deletePrompt(Number(id)); break;
    case 'open-prompt': {
      const p = state.prompts.find(x => x.id === Number(id));
      loadEditorPrompt(p || null);
      go('editor');
      break;
    }
    case 'copy-preview': copyText($('#edPreview')?.textContent || ''); break;
    case 'copy-last': {
      const last = [...chatHistory].reverse().find(m => m.role === 'assistant');
      copyText(last?.content || '');
      break;
    }

    case 'send':        sendMessage(); break;
    case 'use-prompt':  usePrompt(); break;
    case 'clear-chat':  clearChat(); break;
    case 'model':       cycleModel(); break;

    case 'draw':        drawGacha(); break;
    case 'gacha-history': showGachaHistory(); break;
    case 'save-prize':  closeOverlay(); quickSave('扭蛋灵感 · ' + new Date().toLocaleDateString('zh-CN'), el.dataset.text); break;
    case 'save-silly':  quickSave('沙雕灵感 · ' + new Date().toLocaleDateString('zh-CN'), $('#sillyResult')?.textContent || ''); break;
    case 'save-koi':    quickSave('每日锦鲤 · ' + new Date().toLocaleDateString('zh-CN'), koiState.card?.body || ''); break;

    case 'bingo':       toggleBingo(el); break;
    case 'bingo-reset': resetBingo(); break;
    case 'arena-play':  arenaPlay(el); break;
    case 'arena-board': showArenaBoard(); break;

    case 'reroll': {
      const slot = el.dataset.slot;
      await rerollSlot(slot === 'all' ? 'all' : Number(slot));
      break;
    }

    /* --- 沙雕生成器 --- */
    case 'silly-publish': publishSilly(); break;
    case 'silly-like': {
      try {
        const r = await A.likeSilly(Number(id));
        toast(`点赞成功，当前 ${r.likes} ★`, 'success');
        const p = sillyState.hot.find(x => x.id === Number(id));
        if (p) p.likes = r.likes;
        renderSillyHot();
      } catch (err) { toast(err.message, 'danger'); }
      break;
    }

    /* --- 成就 --- */
    case 'badge-cat': break;

    /* --- 锦鲤 / 打卡 --- */
    case 'checkin':     doCheckin(); break;
    case 'koi-makeup':  doMakeup(el.dataset.day); break;

    /* --- 翻车墙 --- */
    case 'fail-submit':    failSubmitSheet(); break;
    case 'do-fail-submit': submitFail(); break;
    case 'fail-like': {
      try {
        const r = await A.likeFail(Number(id));
        failState.liked.push(Number(id));
        const p = failState.posts.find(x => x.id === Number(id));
        if (p) p.likes = r.likes;
        renderFails();
      } catch (err) { toast(err.message, 'danger'); }
      break;
    }

    /* --- 社区 --- */
    case 'community-publish':    communityPublishSheet(); break;
    case 'do-community-publish': submitCommunity(); break;
    case 'community-open':       openCommunityPost(id); break;
    case 'community-use':        useCommunityPost(id); break;
    case 'do-comment':           submitComment(id); break;
    case 'community-like': {
      try {
        const r = await A.likeCommunity(Number(id));
        commState.liked.push(Number(id));
        const p = commState.posts.find(x => x.id === Number(id));
        if (p) p.likes = r.likes;
        renderCommunity();
        if ($('#cmtInput')) openCommunityPost(id);
      } catch (err) { toast(err.message, 'danger'); }
      break;
    }
    case 'community-fav': {
      try {
        const r = await A.favCommunity(Number(id));
        if (r.faved) commState.faved.push(Number(id));
        else commState.faved = commState.faved.filter(x => x !== Number(id));
        const p = commState.posts.find(x => x.id === Number(id));
        if (p) p.favs = r.favs;
        renderCommunity();
        toast(r.faved ? '已收藏 ✓' : '已取消收藏', 'success');
      } catch (err) { toast(err.message, 'danger'); }
      break;
    }

    /* --- 设置 / 数据 --- */
    case 'toggle-notify': saveSettings({ notify: settingsState.notify ? 0 : 1 }); break;
    case 'export-data':   exportData(); break;

    /* --- 批量测试 --- */
    case 'batch-run':     runBatchTest(); break;
    case 'batch-history': showBatchHistory(); break;

    case 'retry-connect':
      toast(navigator.onLine ? '网络已恢复 ✓' : '仍无法连接，请检查网络', navigator.onLine ? 'success' : 'danger');
      break;

    default: toast('演示功能');
  }
});

/* ================= 网络状态 ================= */
function syncNetwork() {
  $$('.screen[data-screen="offline"] .offline-banner').forEach(b => {
    const online = navigator.onLine;
    b.className = `offline-banner ${online ? '' : 'offline-unavailable'}`;
    const t = b.querySelector('.text-bold');
    if (t) t.textContent = online ? '当前状态：在线' : '当前状态：离线';
  });
}
window.addEventListener('online', syncNetwork);
window.addEventListener('offline', syncNetwork);

/* ================= 启动 ================= */
function bindInputs() {
  ['#edSystem', '#edUser', '#edVars'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('input', () => { buildPreview(); markEditorDirty(); });
  });
  const search = $('#libSearch');
  if (search) search.addEventListener('input', renderLibrary);

  let commTimer = null;
  const cs = $('#commSearch');
  if (cs) {
    cs.addEventListener('input', () => {
      clearTimeout(commTimer);
      commTimer = setTimeout(() => loadCommunity(commState.sort, cs.value.trim()), 350);
    });
  }
}

async function boot() {
  renderAll();
  bindInputs();
  setAuthMode('code');

  await loadUser();
  if (state.user) {
    apply(parseHash());
    refreshAll().then(() => {
      syncAll();
      loadEditorPrompt(state.prompts[0] || null);
    }).catch(() => {});
  } else {
    go('login');
  }

  window.addEventListener('hashchange', () => apply(parseHash()));
  document.addEventListener('gesturestart', e => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.classList.contains('input')) {
      const btn = $('.send-btn', e.target.closest('.input-bar') || document);
      if (btn) btn.click();
      return;
    }
    if (e.target.classList.contains('auth-input')) {
      // 验证码模式 + 还没填码 → 回车先发验证码，符合大多数人的习惯
      if (e.target.id === 'authEmail' && authMode === 'code' && !($('#authCode')?.value || '').trim()) {
        sendCodeFlow();
      } else {
        submitAuth();
      }
    }
  });

  syncNetwork();

  // 注意：boot() 常在 load 之后才执行，若只挂 load 监听会导致 SW 永远不注册
  if ('serviceWorker' in navigator) {
    const regSW = () => navigator.serviceWorker.register('sw.js').catch(() => {});
    if (document.readyState === 'complete') regSW();
    else window.addEventListener('load', regSW, { once: true });

    // PromptOps 已合并进主应用：注销老用户浏览器里 scope 为 /ops/ 的独立 SW，
    // 否则它会继续拦截 /ops/ 下的静态资源，导致拿到过期的模块代码
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => { if (r.scope.includes('/ops/')) r.unregister().catch(() => {}); });
    }).catch(() => {});
  }
}

boot();
