// Prompt Studio PWA — 主逻辑：路由 / TabBar / 交互 / 离线
import { screens, showTabBar, TITLES } from './screens.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const appEl     = $('#app');
const screensEl = $('#screens');
const tabbarEl  = $('.tabbar');
const toastEl   = $('#toast');
const overlayEl = $('#overlay');

let splashTimer = null;

/* ---------------- 渲染 ---------------- */
function renderAll() {
  screensEl.innerHTML = Object.entries(screens)
    .map(([id, fn]) => fn())
    .join('');
}

/* ---------------- 路由 ---------------- */
const parseHash = () => (location.hash || '').replace(/^#\/?/, '').trim() || 'splash';

function go(id) {
  if (!screens[id]) id = 'workbench';
  const hash = `#/${id}`;
  if (location.hash === hash) { apply(id); return; }
  location.hash = hash;
}

function apply(id) {
  if (!screens[id]) id = 'workbench';

  clearTimeout(splashTimer);
  if (id === 'splash') {
    splashTimer = setTimeout(() => {
      history.replaceState(null, '', '#/workbench');
      apply('workbench');
    }, 2200);
  }

  $$('.screen').forEach(el => el.classList.toggle('active', el.dataset.screen === id));

  const isTab = showTabBar(id);
  appEl.classList.toggle('no-tabbar', !isTab);
  tabbarEl.setAttribute('aria-hidden', String(!isTab));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));

  const sc = $(`.screen[data-screen="${id}"] .screen-scroll`);
  if (sc) sc.scrollTop = 0;

  document.title = id === 'splash' ? 'Prompt Studio 提示词工坊' : `${TITLES[id] || ''} · Prompt Studio`;
}

/* ---------------- Toast ---------------- */
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
  }, 1900);
}

/* ---------------- 浮层 ---------------- */
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

/* ---------------- 主题色 ---------------- */
function setTheme(color) {
  document.documentElement.style.setProperty('--primary', color);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
  $$('[data-action="theme"]').forEach(el => {
    const active = el.dataset.color === color;
    el.className = `swatch${active ? ' active' : ''}`;
  });
}

/* ---------------- 交互委托 ---------------- */
document.addEventListener('click', (e) => {
  if (e.target === overlayEl) { closeOverlay(); return; }
  if (e.target.closest('[data-close]')) { closeOverlay(); return; }

  // 分段控件：编辑器 Tab / Chip / 扭蛋池
  const seg = e.target.closest('.editor-tab, .chip, .pool-tab');
  if (seg) {
    [...seg.parentElement.children].forEach(c => c.classList.remove('active'));
    seg.classList.add('active');
    return;
  }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  let { action, msg, target, color } = el.dataset;

  // 兼容 listItem('xx', 'go:screen') 这类带冒号的写法
  if (action.startsWith('go:')) {
    target = action.slice(3);
    action = 'go';
  }

  switch (action) {
    case 'go':
      go(target);
      break;

    case 'toast':
      toast(msg);
      break;

    case 'theme':
      setTheme(color);
      toast(`主题色已切换 ${color}`);
      break;

    case 'bingo': {
      if (el.classList.contains('free')) { toast('这是免费格 🎁'); return; }
      const done = el.classList.toggle('done');
      el.classList.toggle('undone', !done);
      toast(done ? '打卡成功 +1' : '已取消打卡');
      break;
    }

    case 'reroll':
      el.textContent = '生成中…';
      setTimeout(() => { el.textContent = '换一个'; toast('已重新生成 🎲'); }, 600);
      break;

    case 'draw':
      drawGacha();
      break;

    case 'install':
      promptInstall();
      break;

    case 'retry-connect':
      toast(navigator.onLine ? '网络已恢复 ✓' : '仍无法连接，请检查网络', navigator.onLine ? 'success' : 'danger');
      break;

    case 'send':
      sendMessage(el);
      break;

    default:
      toast('演示功能');
  }
});

/* ---------------- 对话发送 ---------------- */
function sendMessage(btn) {
  const input = $('.input', btn.closest('.input-bar') || document);
  const text = (input?.value || '').trim();
  if (!text) { toast('说点什么吧', 'warning'); return; }

  const area = $('.chat-area', btn.closest('.screen'));
  if (!area) return;

  area.insertAdjacentHTML('beforeend', `<div class="bubble-user">${esc(text)}</div>`);
  input.value = '';
  area.scrollTop = area.scrollHeight;

  const think = document.createElement('div');
  think.className = 'bubble-ai';
  think.textContent = '思考中…';
  area.appendChild(think);
  area.scrollTop = area.scrollHeight;

  setTimeout(() => {
    think.innerHTML = `${esc(text)} —— 已收到。当前为离线演示环境，接入 API Key 后即可真实调用模型。
      <div class="actions"><span data-action="toast" data-msg="已复制到剪贴板">复制</span>
      <span data-action="toast" data-msg="正在重新生成…">重新生成</span>
      <span data-action="toast" data-msg="已固定到顶部">固定</span></div>`;
    area.scrollTop = area.scrollHeight;
  }, 900);
}

const esc = (s) => s.replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------------- 扭蛋动画 ---------------- */
const POOL = [
  '你是一位有 20 年经验的米其林主厨，请用家常食材设计一道惊艳的菜。',
  '把下面这段话分别改写成鲁迅、王小波、村上春树三种风格。',
  '你是我的私人健身教练，请根据我的作息设计一份可执行的一周计划。',
  '请扮演一位毒舌但专业的产品经理，点评我这份需求文档。',
  '为一座不存在的小镇写一段 300 字的旅游文案，要有画面感。'
];
let drawing = false;
function drawGacha() {
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

  setTimeout(() => {
    const prize = POOL[Math.floor(Math.random() * POOL.length)];
    const rare = Math.random() > 0.8;
    overlay(`
      <div class="text-center" style="margin-bottom:12px">
        <div class="text-sm text-muted">恭喜抽到</div>
        <div style="font-size:16px;font-weight:700;margin-top:6px">
          ${rare ? '<span class="text-warning">稀有</span>' : '普通'} · 灵感提示词
        </div>
      </div>
      <div class="card" style="text-align:left">
        <div class="text-sm" style="line-height:1.7">${prize}</div>
      </div>
      <div class="action-bar">
        <button class="btn ghost block" data-close>再抽一次</button>
        <button class="btn block" data-close>保存到素材库</button>
      </div>`);
    drawing = false;
  }, 1500);
}

/* ---------------- 安装到桌面 ---------------- */
let deferredInstall = null;
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  toast('安装成功 🎉', 'success');
});

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

  // Android / 桌面：Chrome 给了 Hook，直接唤起系统安装弹窗
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

/* ---------------- 网络状态 ---------------- */
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

/* ---------------- 启动 ---------------- */
function boot() {
  renderAll();
  apply(parseHash());
  syncNetwork();

  window.addEventListener('hashchange', () => apply(parseHash()));

  // iOS 禁止双指缩放
  document.addEventListener('gesturestart', e => e.preventDefault());

  // 输入框回车发送
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (!e.target.classList.contains('input')) return;
    const btn = $('.send-btn', e.target.closest('.input-bar') || document);
    if (btn) btn.click();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

boot();
