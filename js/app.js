// Prompt Studio PWA — 主逻辑：认证 / 路由 / 云端数据 / AI 真实调用
import { screens, showTabBar, TITLES } from './screens.js';
import * as A from './api.js';
import {
  state, MODELS, nfmt, kfmt, loadUser, refreshPrompts, refreshStats,
  loadBingo, refreshAll, todayCalls, totalTokens, bingoDone, bingoLines,
  currentPrompt
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

function go(id) {
  if (!screens[id]) id = 'workbench';
  const hash = `#/${id}`;
  if (location.hash === hash) { apply(id); return; }
  location.hash = hash;
}

function apply(id) {
  if (!screens[id]) id = 'workbench';

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
  if ($('#edTitle')) $('#edTitle').value = p?.title || '';
  if ($('#edSystem')) $('#edSystem').textContent = p?.system_prompt || '';
  if ($('#edUser')) $('#edUser').textContent = p?.user_prompt || '';
  if ($('#edVars')) $('#edVars').textContent = varsToText(p?.variables);
  if ($('#edSaved')) $('#edSaved').textContent = p ? `已保存 · ${relTime(p.updated_at)}` : '未保存';
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

function cycleModel() {
  const i = MODELS.findIndex(m => m.id === state.model);
  state.model = MODELS[(i + 1) % MODELS.length].id;
  const pill = $('#modelPill');
  if (pill) pill.innerHTML = `${MODELS.find(m => m.id === state.model).name} <span class="text-muted">▾</span>`;
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

/* ================= 沙雕生成器 ================= */
const SILLY = [
  ['一只会用 Excel 的橘猫', '一台有中年危机的咖啡机', '刚学会上网的兵马俑', '从大厂离职的扫地机器人', '一只考过 CPA 的柯基', '穿越到现代的李白'],
  ['用公文格式写辞职信', '写一份融资 BP', '给暗恋对象发一条微信', '策划一场公司年会', '解释什么是区块链', '写一份小区业主公约'],
  ['参考王家卫电影风格', '用鲁迅的语气', '像小红书爆款笔记', '以宋代话本的口吻', '用脱口秀的节奏', '模仿产品发布会']
];

function rerollSlot(i) {
  const el = $(`.silly-slot[data-slot="${i}"] .value`);
  if (!el) return;
  const bank = SILLY[i];
  const cur = el.textContent;
  let next = cur;
  while (next === cur) next = bank[Math.floor(Math.random() * bank.length)];
  el.textContent = next;
}

function updateSilly() {
  const v = [0, 1, 2].map(i => $(`.silly-slot[data-slot="${i}"] .value`)?.textContent || '');
  const el = $('#sillyResult');
  if (el) el.textContent = `请让${v[0]}，${v[1]}，文风${v[2]}。`;
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

    case 'auth-mode':   setAuthMode(el.dataset.mode); break;
    case 'password-sheet': openPasswordSheet(false); break;
    case 'do-set-password': submitSetPassword(); break;

    case 'new-prompt':  newPrompt(); break;
    case 'save-prompt': savePrompt(); break;
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
    case 'save-koi':    quickSave('每日锦鲤 · ' + new Date().toLocaleDateString('zh-CN'), '请扮演一位阅尽千帆的深夜电台主播，用三句话安慰今天加班到现在的我。'); break;

    case 'bingo':       toggleBingo(el); break;
    case 'bingo-reset': resetBingo(); break;
    case 'arena-play':  arenaPlay(el); break;

    case 'reroll': {
      const slot = el.dataset.slot;
      if (slot === 'all') [0, 1, 2].forEach(rerollSlot); else rerollSlot(Number(slot));
      updateSilly();
      break;
    }

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
    if (el) el.addEventListener('input', buildPreview);
  });
  const search = $('#libSearch');
  if (search) search.addEventListener('input', renderLibrary);
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

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

boot();
