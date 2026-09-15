/* PromptOps 前端主程序：8 屏 + 路由 + 轮询 */
const state = {
  user: null,
  projects: [],
  library: null,
  poll: null
};

const ICONS = {
  chart: '<svg viewBox="0 0 20 20" fill="none"><path d="M3 17V9M8 17V4M13 17v-6M18 17v-9" stroke="#6B7075" stroke-width="1.8" stroke-linecap="round"/></svg>',
  db: '<svg viewBox="0 0 20 20" fill="none"><ellipse cx="10" cy="5" rx="6" ry="2.5" stroke="#6B7075" stroke-width="1.6"/><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" stroke="#6B7075" stroke-width="1.6" stroke-linecap="round"/></svg>',
  branch: '<svg viewBox="0 0 20 20" fill="none"><circle cx="6" cy="5" r="2" stroke="#6B7075" stroke-width="1.6"/><circle cx="6" cy="15" r="2" stroke="#6B7075" stroke-width="1.6"/><circle cx="14" cy="5" r="2" stroke="#6B7075" stroke-width="1.6"/><path d="M6 7v6M14 7v1.5c0 1.4-1.1 2.5-2.5 2.5H9" stroke="#6B7075" stroke-width="1.6" stroke-linecap="round"/></svg>',
  user: '<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="#6B7075" stroke-width="1.6"/><path d="M4 17c0-2.8 2.7-5 6-5s6 2.2 6 5" stroke="#6B7075" stroke-width="1.6" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 20 20" fill="none"><path d="M12 4L6 10l6 6" stroke="#E8EAED" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/* ---------------- 外壳 ---------------- */
function shell(inner, { nav = null, tab = '' } = {}) {
  const bar = nav ? `<div class="nav">${nav}</div>` : '';
  return `<div class="status"><span>9:41</span><span class="dots"><i></i><i></i><i></i></span></div>
          <div class="page">${bar}${offlineBanner()}${inner}</div>`;
}

/** 离线降级横幅：告诉用户看到的是缓存，不是"坏了" */
function offlineBanner() {
  if (!window.__opsOffline) return '';
  const when = window.__opsOfflineAt
    ? new Date(window.__opsOfflineAt).toTimeString().slice(0, 5) : '';
  return `<div class="card" style="background:#2A2110;border-color:#5A4218;padding:10px 14px">
    <div class="t12 warn">离线模式 · 显示 ${when} 的缓存数据</div></div>`;
}
const navBar = (title, right = '') =>
  `<div class="back" onclick="history.back()">${ICONS.back}</div><h2>${esc(title)}</h2>
   <div class="act">${right || '<span></span>'}</div>`;

function setTab(name) {
  document.querySelectorAll('#tabbar .tab').forEach(a =>
    a.classList.toggle('on', a.dataset.tab === name));
}

/* ---------------- 路由 ---------------- */
let routeSeq = 0;          // 竞态保护：快速连点时只认最后一次导航
let loadingTimer = null;   // 延迟骨架屏：避免快页面闪烁

function armLoading(app) {
  clearTimeout(loadingTimer);
  // 350ms 后仍未渲染完才显示骨架：快页面不会闪，慢页面不会"点了没反应"
  loadingTimer = setTimeout(() => {
    render(app, `<div class="status"><span>9:41</span><span class="dots"><i></i><i></i><i></i></span></div>
      <div class="page">
        <div class="sk sk-h"></div>
        <div class="sk sk-card"></div>
        <div class="sk sk-card"></div>
        <div class="sk sk-card short"></div>
      </div>`, '');
  }, 350);
}
function clearLoading() {
  clearTimeout(loadingTimer);
  loadingTimer = null;
}

async function route() {
  const seq = ++routeSeq;
  const hash = location.hash.replace(/^#/, '') || '/';
  const seg = hash.split('/').filter(Boolean);
  stopPoll();
  const app = document.getElementById('app');
  document.getElementById('tabbar').hidden = false;
  app.scrollTop = 0;
  armLoading(app);
  const done = (html, tab) => {
    if (seq !== routeSeq) return;   // 已经有更新的导航，丢弃这次结果
    clearLoading();
    render(app, html, tab);
  };

  try {
    if (!state.user) {
      const { user } = await get('auth/me');
      state.user = user;
    }

    if (!state.user) return done(loginScreen(), 'me');

    switch (seg[0]) {
      case undefined:      setTab('home');    return done(await screenHome(), 'home');
      case 'data':         setTab('data');    return done(await screenDatasets(), 'data');
      case 'dataset':      setTab('data');    return done(await screenDataset(seg[1]), 'data');
      case 'new':          setTab('home');    return done(await screenNew(), 'home');
      case 'project':      setTab('home');    return done(await screenProject(seg[1]), 'home');
      case 'run':          setTab('home');    return done(await screenRun(seg[1]), 'home');
      case 'report':       setTab('home');    return done(await screenReport(seg[1]), 'home');
      case 'results':      setTab('home');    return done(await screenResults(seg[1], seg[2] || 'fail'), 'home');
      case 'case':         setTab('home');    return done(await screenCase(seg[1], seg[2]), 'home');
      case 'diff':         setTab('library'); return done(await screenDiff(seg[1]), 'library');
      case 'library':      setTab('library'); return done(await screenLibrary(), 'library');
      case 'me':           setTab('me');      return done(await screenMe(), 'me');
      default:             setTab('home');    return done(await screenHome(), 'home');
    }
  } catch (e) {
    done(e.offline
      ? `<div class="empty"><b>当前处于离线状态</b>本机还没有这份数据的缓存，
           连上网络后会自动恢复。<br><br>
           <button class="btn primary" onclick="route()">重试</button></div>`
      : `<div class="empty"><b>出错了</b>${esc(e.message)}</div>`, '');
  }
}

function render(app, html, tab) {
  app.innerHTML = html;
  if (tab) setTab(tab);
}

/* ================= 登录 ================= */
function loginScreen() {
  return shell(`
    <div style="padding:40px 0 8px">
      <h1 class="title">PromptOps</h1>
      <p class="subtitle" style="margin-top:6px">LLM 评测与回归平台 · 用数据证明提示词变好了</p>
    </div>
    <div class="card" style="margin-top:24px">
      <div class="t12 muted">邮箱验证码登录（与 Prompt Studio 同一账号）</div>
      <input id="lg-mail" type="email" placeholder="you@example.com" autocomplete="email">
      <div class="row">
        <input id="lg-code" placeholder="6 位验证码" inputmode="numeric" style="flex:1">
        <button class="btn sm" style="width:auto;white-space:nowrap" onclick="sendCode()">获取验证码</button>
      </div>
      <button class="btn primary" onclick="doLogin()">登录 / 注册</button>
    </div>
    <div class="empty" style="padding-top:16px">登录后自动初始化一个示例评测项目</div>
  `, {});
}

async function sendCode() {
  const mail = $('#lg-mail').value.trim();
  if (!mail) return toast('请填写邮箱');
  try {
    const r = await post('auth/send-code', { email: mail });
    toast(r.dev_code ? `验证码已发送（调试码 ${r.dev_code}）` : '验证码已发送，请查收邮件');
  } catch (e) { toast(e.message); }
}
async function doLogin() {
  const email = $('#lg-mail').value.trim();
  const code = $('#lg-code').value.trim();
  if (!email || !code) return toast('请填写邮箱与验证码');
  try {
    await post('auth/verify-code', { email, code });
    state.user = null;
    toast('登录成功');
    route();
  } catch (e) { toast(e.message); }
}

/* ================= 1 评测台 ================= */
async function screenHome() {
  const d = await get('overview');
  state.projects = d.projects;
  const pj = d.projects.map(p => {
    const rateTxt = p.rate === null ? '<span class="t13 muted">尚未运行</span>'
      : `<span class="t15 semi ${p.rate >= 85 ? 'ok' : p.rate >= 75 ? 'warn' : 'bad'}">通过率 ${p.rate}%</span>`;
    const delta = (p.rate !== null && p.delta !== null)
      ? `<span class="t12 ${p.delta >= 0 ? 'ok' : 'bad'}">较上次 ${p.delta >= 0 ? '+' : ''}${p.delta}${p.delta < 0 ? ' 已退化' : ''}</span>`
      : '<span class="t12 dim">首次运行</span>';
    const when = p.status === 'running' ? '<span class="blue t12">运行中</span>' : ago(p.finished_at);
    return `<div class="item" onclick="location.hash='#/report/${p.run_id}'">
      <div class="t15 semi">${esc(p.name)}</div>
      <div class="meta">${esc(p.run_no)} · ${esc(when)} · ${esc(p.model)}${p.version_label !== '-' ? ' · ' + esc(p.version_label) : ''}</div>
      <div class="row" style="margin-top:2px">${rateTxt}${delta}</div>
    </div>`;
  }).join('');

  return shell(`
    <div><h1 class="title">评测台</h1>
      <p class="subtitle">${d.projects.length} 个评测项目 · 本周共 ${d.stats.week_runs} 次运行</p></div>
    <div class="stats">
      <div class="stat"><b class="blue">${d.stats.avg_rate}%</b><span>平均通过率</span></div>
      <div class="stat"><b>${d.stats.case_total}</b><span>评测用例</span></div>
      <div class="stat"><b>${d.stats.week_runs}</b><span>本周运行</span></div>
    </div>
    <div class="sect">评测项目</div>
    ${pj || '<div class="empty"><b>还没有项目</b>前往「版本」页创建提示词项目</div>'}
    <button class="btn primary" onclick="location.hash='#/new'">新建评测</button>
  `);
}

/* ================= 项目详情 ================= */
async function screenProject(id) {
  const d = await get(`projects/${id}`);
  const p = d.project;
  const vs = d.versions.map(v => `<div class="item">
      <div class="row"><span class="t14 semi">${esc(v.label)} ${v.is_online ? '<span class="tag ok">线上</span>' : ''}</span></div>
      <div class="meta">${esc(v.note || '无备注')} · ${esc(v.model)}</div>
      <pre class="code">${esc(v.template)}</pre>
    </div>`).join('');
  const runs = d.runs.map(r => `<div class="item" onclick="location.hash='#/report/${r.id}'">
      <div class="row"><span class="t14 semi">#${r.id} · ${esc(r.version_label || '')}</span>
        <span class="t13 ${r.status === 'done' ? 'muted' : 'blue'}">${r.status === 'done' ? '完成' : r.status}</span></div>
      <div class="meta">${ago(r.started_at)} · ${esc(r.model)} · ${r.total} 条</div>
      <div class="row"><span class="t13 semi ${r.total && r.pass / r.total >= .85 ? 'ok' : 'warn'}">通过率 ${r.total ? ((r.pass / r.total) * 100).toFixed(1) : 0}%</span>
        <span class="t12 dim">${r.pass} 通过 / ${r.fail} 失败</span></div>
    </div>`).join('');

  return shell(`
    ${navBar(p.name, '<span onclick="location.hash=\'#/new\'">评测</span>')}
    <div class="t13 muted">${esc(p.description || '暂无描述')}</div>
    <div class="sect">数据集</div>
    ${d.datasets.map(x => `<div class="item" onclick="location.hash='#/dataset/${x.id}'">
      <div class="t14 semi">${esc(x.name)} · ${esc(x.version_label)}</div>
      <div class="meta">${x.case_count} 条用例 · 更新于 ${ago(x.updated_at)}</div></div>`).join('') || '<div class="empty">暂无数据集</div>'}
    <div class="sect">提示词版本</div>${vs}
    <div class="sect">运行历史</div>${runs || '<div class="empty">还没有运行记录</div>'}
  `);
}

/* ================= 数据集列表 ================= */
async function screenDatasets() {
  const { projects } = await get('projects');
  const rows = [];
  for (const p of projects) {
    const d = await get(`projects/${p.id}`);
    for (const ds of d.datasets) rows.push({ ...ds, project_name: p.name });
  }
  return shell(`
    <div><h1 class="title">数据集</h1><p class="subtitle">${rows.length} 个评测集</p></div>
    ${rows.map(r => `<div class="item" onclick="location.hash='#/dataset/${r.id}'">
      <div class="t14 semi">${esc(r.name)} · ${esc(r.version_label)}</div>
      <div class="meta">${esc(r.project_name)} · ${r.case_count} 条用例 · 更新于 ${ago(r.updated_at)}</div>
    </div>`).join('') || '<div class="empty"><b>还没有数据集</b>先创建一个评测项目</div>'}
  `);
}

/* ================= 2 数据集用例 ================= */
let dsFilter = '';
async function screenDataset(id) {
  const url = `datasets/${id}/cases` + (dsFilter ? `?status=${encodeURIComponent(dsFilter)}` : '');
  const d = await get(url);
  const ds = d.dataset;
  const list = d.cases.map(c => {
    const st = c.state === 'pass' ? '<span class="t12 ok">通过</span>'
      : c.state === 'fail' ? '<span class="t12 bad">失败</span>' : '<span class="t12 dim">未跑</span>';
    const exp = (() => { try { const e = JSON.parse(c.expected); return e.human || JSON.stringify(e.rule || e); } catch { return ''; } })();
    return `<div class="item" onclick="location.hash='#/dataset/${id}?c=${c.id}'">
      <div class="row"><span class="mono t12 dim">#${esc(c.code)}</span>${st}</div>
      <div class="t13">${esc(c.input)}</div>
      ${exp ? `<div class="t12 muted">期望：${esc(exp)}</div>` : ''}
    </div>`;
  }).join('');

  return shell(`
    ${navBar(`${ds.name} · ${ds.version_label}`, `<span onclick="addCase(${id})">+ 用例</span>`)}
    <div class="t12 muted">${ds.case_count} 条用例 · 更新于 ${ago(ds.updated_at)}</div>
    <div class="seg">
      <div class="chip ${dsFilter === '' ? 'on' : ''}" onclick="setFilter('')">全部 ${d.counts.all}</div>
      <div class="chip ${dsFilter === '失败' ? 'on' : ''}" onclick="setFilter('失败')">失败 ${d.counts.fail}</div>
      <div class="chip ${dsFilter === '未标注' ? 'on' : ''}" onclick="setFilter('未标注')">未标注 ${d.counts.pending}</div>
    </div>
    ${list || '<div class="empty"><b>没有符合条件的用例</b>换个筛选试试</div>'}
  `);
}
function setFilter(f) { dsFilter = f; route(); }
async function addCase(did) {
  const input = prompt('用例输入：\n（可用 {{变量}} 占位）');
  if (!input) return;
  const exp = prompt('期望规则（关键词，逗号分隔；或留空）：') || '';
  const keywords = exp.split(/[,，\s]+/).filter(Boolean);
  const maxLen = Number(prompt('字数上限（默认 20）：') || 20);
  try {
    await post(`datasets/${did}/cases`, {
      input,
      expected: { rule: { contains: keywords, maxLen }, human: keywords.length ? `包含「${keywords.join('、')}」且不超过 ${maxLen} 字` : `不超过 ${maxLen} 字` }
    });
    toast('已添加'); route();
  } catch (e) { toast(e.message); }
}

/* ================= 3 新建评测 ================= */
const newForm = { project_id: '', version_id: '', dataset_id: '', model: 'qwen-plus', scorers: ['rule', 'llm'] };
async function screenNew() {
  const { projects } = await get('projects');
  if (!projects.length) return shell(`<div class="empty"><b>还没有项目</b>请先创建一个评测项目</div>${projectFormHtml()}`);
  if (!newForm.project_id) newForm.project_id = projects[0].id;
  const d = await get(`projects/${newForm.project_id}`);
  if (!newForm.version_id && d.versions.length) newForm.version_id = d.versions[0].id;
  if (!newForm.dataset_id && d.datasets.length) newForm.dataset_id = d.datasets[0].id;

  const est = await post('runs/preview', { dataset_id: newForm.dataset_id, scorers: newForm.scorers });
  const chk = (k, label) => `<div class="row" style="justify-content:flex-start;gap:10px" onclick="toggleScorer('${k}')">
      <div style="width:14px;height:14px;border-radius:4px;background:${newForm.scorers.includes(k) ? 'var(--primary)' : 'var(--panel)'};border:1px solid var(--line)"></div>
      <span class="t13">${label}</span></div>`;

  return shell(`
    ${navBar('新建评测')}
    <div class="field"><label>评测项目</label>
      <select onchange="newForm.project_id=this.value;newForm.version_id='';newForm.dataset_id='';route()">
        ${projects.map(p => `<option value="${p.id}" ${p.id == newForm.project_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select></div>
    <div class="field"><label>提示词版本</label>
      <select onchange="newForm.version_id=this.value;route()">
        ${d.versions.map(v => `<option value="${v.id}" ${v.id == newForm.version_id ? 'selected' : ''}>${esc(v.label)} · ${esc(v.note || '')}</option>`).join('')}
      </select>
      ${d.versions.filter(v => v.id == newForm.version_id).map(v => `<pre class="code">${esc(v.template)}</pre>`).join('')}
    </div>
    <div class="field"><label>数据集</label>
      <select onchange="newForm.dataset_id=this.value;route()">
        ${d.datasets.map(s => `<option value="${s.id}" ${s.id == newForm.dataset_id ? 'selected' : ''}>${esc(s.name)} · ${s.case_count} 条</option>`).join('')}
      </select>
      <div class="t12 dim">最近更新 ${ago(d.datasets.find(x => x.id == newForm.dataset_id)?.updated_at)}</div>
    </div>
    <div class="field"><label>模型</label>
      <select onchange="newForm.model=this.value">
        ${['qwen-plus', 'qwen-turbo', 'qwen-max', 'deepseek-chat', 'glm-4-flash', 'gpt-4o-mini']
          .map(m => `<option ${m === newForm.model ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
      <div class="t12 dim">未配置个人密钥时使用服务端兜底密钥</div>
    </div>
    <div class="field"><label>评分器（可多选）</label>
      ${chk('rule', '规则断言 · 包含 / 长度 / 正则')}
      ${chk('schema', 'JSON Schema 结构校验')}
      ${chk('llm', 'LLM 裁判 0–10 分（附评分理由）')}
    </div>
    <div class="card tint"><div class="t12 muted">本次预估</div>
      <div class="t14 semi">${est.calls} 次调用 · 约 ${est.seconds} 秒 · 约 ${money(est.cost)}</div>
      <div class="t12 dim">temperature 0 · 每条 1 次 · 并发 4</div></div>
    <button class="btn primary" onclick="startRun()">开始评测</button>
  `);
}
function toggleScorer(k) {
  newForm.scorers = newForm.scorers.includes(k)
    ? newForm.scorers.filter(x => x !== k) : [...newForm.scorers, k];
  route();
}
async function startRun() {
  try {
    const r = await post('runs', {
      project_id: newForm.project_id, version_id: newForm.version_id,
      dataset_id: newForm.dataset_id, model: newForm.model,
      params: { temperature: 0 }, scorers: newForm.scorers
    });
    location.hash = `#/run/${r.id}`;
    setTimeout(route, 30);
  } catch (e) { toast(e.message); }
}

function projectFormHtml() {
  return `<div class="card" style="margin-top:16px">
    <input id="pj-name" placeholder="项目名称，如：客服意图分类">
    <input id="pj-desc" placeholder="一句话描述（可选）">
    <textarea id="pj-tpl" placeholder="提示词模板，例：为{{product}}写一句广告语，语气{{style}}。">请处理：{{input}}</textarea>
    <button class="btn primary" onclick="createProject()">创建项目</button></div>`;
}
async function createProject() {
  try {
    const r = await post('projects', {
      name: $('#pj-name').value, description: $('#pj-desc').value, template: $('#pj-tpl').value
    });
    newForm.project_id = r.id; newForm.version_id = r.version_id; newForm.dataset_id = r.dataset_id;
    toast('项目已创建，去加几条用例吧');
    location.hash = `#/dataset/${r.dataset_id}`;
    setTimeout(route, 30);
  } catch (e) { toast(e.message); }
}

/* ================= 4 评测运行中 ================= */
async function screenRun(id) {
  const d = await get(`runs/${id}`);
  const r = d.run;
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
  const logs = d.results.filter(x => x.status !== 'pending').slice(-8).map(x => {
    const t = (x.latency_ms / 1000).toFixed(2);
    const ok = x.status === 'pass';
    const code = (x.code || '').padEnd(4);
    return `<div class="l ${ok ? '' : 'bad'}">${ok ? '✓' : '✗'} ${esc(code)} ${ok ? '通过' : '失败'}  ${t}s  ${x.tokens_in + x.tokens_out} tok ${ok ? '' : ' · ' + esc((x.reason || x.error || '').slice(0, 24))}</div>`;
  }).join('') || '<div class="l">等待第一批结果…</div>';

  const done = r.status === 'done' || r.status === 'no_key';
  if (!done) startPoll(id);

  return shell(`
    ${navBar('评测运行中', `<span onclick="stopRun(${id})">停止</span>`)}
    <div class="t13 muted">#${r.id} · ${esc(r.project_name)} · ${esc(r.version_label || '')} · ${esc(r.model)}</div>
    <div class="card">
      <div class="row"><span class="big sm blue">${pct}%</span><span class="t13 muted">${r.done} / ${r.total} 条</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>
    <div class="stats">
      <div class="stat"><b class="ok">${r.pass}</b><span>通过</span></div>
      <div class="stat"><b class="bad">${r.fail}</b><span>失败</span></div>
      <div class="stat"><b>${Math.max(0, r.total - r.done)}</b><span>待定</span></div>
    </div>
    <div class="log"><div class="t12 dim" style="font-family:inherit">实时日志</div>${logs}</div>
    ${done ? `<button class="btn primary" onclick="location.hash='#/report/${id}'">查看评测报告</button>`
           : `<button class="btn" onclick="route()">刷新进度</button>`}
    ${r.status === 'no_key' ? '<div class="card danger"><div class="t13 bad semi">没有可用的模型密钥</div><div class="t12 muted">请在「我的」页添加自己的 API Key，或联系管理员配置服务端密钥。</div></div>' : ''}
  `);
}
function startPoll(id) {
  stopPoll();
  state.poll = setInterval(async () => {
    try {
      const d = await get(`runs/${id}`);
      if (d.run.status === 'done' || d.run.status === 'no_key') {
        stopPoll();
        location.hash = `#/report/${id}`;
      }
      route();
    } catch { stopPoll(); }
  }, 2500);
}
function stopPoll() { if (state.poll) { clearInterval(state.poll); state.poll = null; } }
async function stopRun(id) { await post(`runs/${id}/stop`); toast('已请求停止'); }

/* ================= 5 评测报告 ================= */
async function screenReport(id) {
  const d = await get(`runs/${id}/report`);
  const r = d.run, m = d.metrics, c = d.compare;
  const rateCls = m.rate >= 85 ? 'ok' : m.rate >= 75 ? 'warn' : 'bad';
  const degraded = c.delta !== null && c.delta < 0;

  const scorerRows = d.scorers.map(s => `<div class="row">
      <span class="t13">${esc(s.name)}</span>
      <span class="t13 semi ${s.rate >= .85 ? 'ok' : s.rate >= .7 ? 'warn' : 'bad'}">${esc(s.value)}</span>
    </div>`).join('') || '<div class="t12 dim">本次未启用评分器</div>';

  const clusters = d.clusters.map(x => `<div class="row">
      <span class="t13">${esc(x.name)}</span><span class="t13 semi bad">${x.count} 条</span></div>`).join('')
    || '<div class="t12 dim">没有失败用例 🎉</div>';

  return shell(`
    ${navBar('评测报告', `<span onclick="location.hash='#/project/${r.project_id}'">项目</span>`)}
    <div class="t13 muted">#${r.id} · ${esc(r.project_name)} · ${esc(r.version_label || '')} · ${ago(r.finished_at || r.started_at)}</div>
    <div class="card ${degraded ? 'danger' : ''}">
      <div class="row"><span class="big ${rateCls}">${m.rate}%</span><span class="t12 muted">总体通过率</span></div>
      ${c.delta !== null ? `<div class="t13 semi ${degraded ? 'bad' : 'ok'}">较上次 ${c.prev_rate}% ${degraded ? '下降 ' + Math.abs(c.delta) + ' · 已触发退化告警' : '提升 +' + c.delta}</div>` : '<div class="t13 muted">首次运行，暂无对比基线</div>'}
      ${c.baseline_rate !== null ? `<div class="t12 dim">基线为 ${c.baseline_rate}%，本次${m.rate >= c.baseline_rate ? '达标' : '未达基线'}</div>` : ''}
    </div>
    <div class="stats four">
      <div class="stat"><b>${m.avg_score || '—'}</b><span>平均分</span></div>
      <div class="stat"><b>${(m.avg_latency / 1000).toFixed(1)}s</b><span>平均耗时</span></div>
      <div class="stat"><b>${money(m.cost)}</b><span>本次成本</span></div>
      <div class="stat"><b>${m.total}</b><span>用例数</span></div>
    </div>
    <div class="card"><div class="t12 muted">评分器分项</div>${scorerRows}</div>
    <div class="card"><div class="t12 muted">失败原因聚类</div>${clusters}</div>
    <button class="btn primary" onclick="location.hash='#/results/${id}'">查看 ${m.fail} 条失败用例</button>
    <button class="btn" onclick="location.hash='#/diff/${r.project_id}'">与基线版本对比</button>
  `);
}

/* 结果列表（失败用例） */
async function screenResults(runId, only = 'fail') {
  const d = await get(`runs/${runId}`);
  const list = d.results.filter(r => only === 'all' || r.status === only);
  return shell(`
    ${navBar(`结果 · #${runId}`)}
    <div class="seg">
      <div class="chip ${only === 'fail' ? 'on' : ''}" onclick="location.hash='#/results/${runId}/fail'">失败 ${d.results.filter(r => r.status === 'fail').length}</div>
      <div class="chip ${only === 'pass' ? 'on' : ''}" onclick="location.hash='#/results/${runId}/pass'">通过 ${d.results.filter(r => r.status === 'pass').length}</div>
      <div class="chip ${only === 'all' ? 'on' : ''}" onclick="location.hash='#/results/${runId}/all'">全部 ${d.results.length}</div>
    </div>
    ${list.map(r => `<div class="item" onclick="location.hash='#/case/${runId}/${r.id}'">
      <div class="row"><span class="mono t12 dim">#${esc(r.code)}</span>
        <span class="tag ${r.status === 'pass' ? 'ok' : 'bad'}">${r.status === 'pass' ? '通过' : '失败'}</span></div>
      <div class="t13">${esc(r.input)}</div>
      <div class="t12 muted" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(r.output || '（无输出）')}</div>
      ${r.reason ? `<div class="t12 dim">${esc(r.reason.slice(0, 40))}</div>` : ''}
    </div>`).join('') || '<div class="empty"><b>没有记录</b></div>'}
  `);
}

/* ================= 6 用例明细 ================= */
async function screenCase(runId, resultId) {
  const d = await get(`runs/${runId}`);
  const i = d.results.findIndex(x => String(x.id) === String(resultId));
  const r = d.results[i];
  if (!r) return shell('<div class="empty">用例不存在</div>');
  const exp = (() => { try { return JSON.parse(r.expected); } catch { return {}; } })();
  const detail = (() => { try { return JSON.parse(r.detail); } catch { return {}; } })();
  const next = d.results[i + 1];
  const vars = (() => { try { return JSON.parse(r.variables); } catch { return {}; } })();
  const rule = detail.rule || {};
  const llm = detail.llm || {};
  const prev = d.results[i - 1];

  return shell(`
    ${navBar(`用例 #${r.code}`, next ? `<span onclick="location.hash='#/case/${runId}/${next.id}'">下一条</span>` : '')}
    <div class="card ${r.status === 'pass' ? 'ok' : 'danger'}">
      <div class="row"><span class="t20 bold ${r.status === 'pass' ? 'ok' : 'bad'}">${r.status === 'pass' ? '通过' : '失败'}</span>
        <span class="t12 muted">${(rule.pass ? 1 : 0) + (detail.schema?.pass ? 1 : 0) + (llm.score >= 6 ? 1 : 0)} / ${['rule', 'schema', 'llm'].filter(k => detail[k]).length} 项评分器通过</span></div>
      ${r.reason ? `<div class="t12 ${r.status === 'pass' ? 'muted' : 'bad'}">${esc(r.reason)}</div>` : ''}
    </div>
    <div class="card"><div class="t12 muted">输入</div>
      <div class="t14">${esc(r.input)}</div>
      ${Object.keys(vars).length ? `<div class="t12 dim mono">变量：${Object.entries(vars).map(([k, v]) => `${k} = ${v}`).join('   ')}</div>` : ''}
    </div>
    <div class="card"><div class="t12 muted">期望（评分规则）</div>
      <div class="t14">${esc(exp.human || JSON.stringify(exp.rule || exp))}</div></div>
    <div class="card ${r.status === 'pass' ? '' : 'danger'}">
      <div class="row"><span class="t12 muted">实际输出</span>
        <span class="t12 ${r.output?.length > (exp.rule?.maxLen || 999) ? 'bad' : 'muted'}">${r.output?.length || 0} 字${r.output?.length > (exp.rule?.maxLen || 999) ? ' · 超出 ' + (r.output.length - exp.rule.maxLen) + ' 字' : ''}</span></div>
      <div class="t14">${esc(r.output || '（无输出）')}</div>
      ${rule.reasons?.length ? rule.reasons.map(x => `<div class="t12 bad">${esc(x)}</div>`).join('') : ''}
    </div>
    <div class="card"><div class="t12 muted">评分明细</div>
      ${detail.rule ? `<div class="row"><span class="t13">规则断言</span><span class="t13 semi ${rule.pass ? 'ok' : 'bad'}">${rule.pass ? '通过' : '未通过'}</span></div>` : ''}
      ${detail.schema ? `<div class="row"><span class="t13">JSON Schema</span><span class="t13 semi ${detail.schema.pass ? 'ok' : 'bad'}">${detail.schema.pass ? '通过' : '未通过'}</span></div>` : ''}
      ${llm.score !== undefined ? `<div class="row"><span class="t13">LLM 裁判</span><span class="t13 semi ${llm.score >= 8 ? 'ok' : llm.score >= 6 ? 'warn' : 'bad'}">${llm.score} / 10</span></div>
        <div class="t12 muted">裁判理由：${esc(llm.reason || '—')}</div>` : ''}
      <div class="divider"></div>
      <div class="t12 dim">耗时 ${(r.latency_ms / 1000).toFixed(2)}s · ${r.tokens_in + r.tokens_out} tokens · ${money(r.cost)}</div>
    </div>
    ${prev && prev.case_id === r.case_id ? '' : ''}
    <div class="row" style="gap:10px">
      <button class="btn" onclick="location.hash='#/results/${runId}/all'">返回列表</button>
      <button class="btn primary" onclick="location.hash='#/new'">改提示词重跑</button>
    </div>
  `);
}

/* ================= 7 版本对比 ================= */
async function screenDiff(pid) {
  const { projects } = await get('projects');
  if (!projects.length) return shell('<div class="empty"><b>还没有项目</b></div>');
  const id = pid || projects[0].id;
  const d = await get(`projects/${id}`);
  const runs = d.runs.filter(r => r.status === 'done');
  const a = new URLSearchParams(location.hash.split('?')[1] || '');
  const aid = a.get('a') || runs[1]?.id || runs[0]?.id;
  const bid = a.get('b') || runs[0]?.id;
  if (!runs.length) return shell(`${navBar('版本对比')}<div class="empty"><b>还没有可对比的运行</b>至少跑两次评测才能对比</div>`);

  const df = (aid && bid) ? await get(`diff?a=${aid}&b=${bid}`) : null;
  const row = (label, va, vb, unit = '', good = 'up') => {
    const delta = (vb - va);
    const better = good === 'up' ? delta > 0 : delta < 0;
    return `<div class="row"><span class="t12 muted" style="width:72px">${label}</span>
      <span class="t14 semi" style="flex:1;text-align:center">${va}${unit} → ${vb}${unit}</span>
      <span class="t12 ${delta === 0 ? 'muted' : better ? 'ok' : 'bad'}">${delta > 0 ? '+' : ''}${Number(delta.toFixed(2))}${unit}</span></div>`;
  };

  return shell(`
    ${navBar('版本对比', `<span onclick="diffGo()">对比</span>`)}
    <select id="df-p" onchange="location.hash='#/diff/'+this.value">
      ${projects.map(p => `<option value="${p.id}" ${p.id == id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select>
    <div class="row" style="gap:10px">
      <select id="df-a" style="flex:1">${runs.map(r => `<option value="${r.id}" ${r.id == aid ? 'selected' : ''}>${esc(r.version_label || 'V')} · #${r.id}</option>`).join('')}</select>
      <span class="dim">→</span>
      <select id="df-b" style="flex:1">${runs.map(r => `<option value="${r.id}" ${r.id == bid ? 'selected' : ''}>${esc(r.version_label || 'V')} · #${r.id}</option>`).join('')}</select>
    </div>
    ${df ? `
      <div class="t12 dim">同一数据集（${df.b.total} 条）· temperature 0</div>
      <div class="card">
        ${row('通过率', df.a.rate, df.b.rate, '%')}
        ${row('平均分', df.a.score || 0, df.b.score || 0, '')}
        ${row('平均耗时', +(df.a.latency / 1000).toFixed(2), +(df.b.latency / 1000).toFixed(2), 's', 'down')}
        ${row('本次成本', +df.a.cost.toFixed(4), +df.b.cost.toFixed(4), '', 'down')}
      </div>
      <div class="card tint">
        <div class="t12 muted">结论</div>
        <div class="t14 semi ${df.b.rate >= df.a.rate ? 'ok' : 'warn'}">
          ${df.b.rate >= df.a.rate ? '新版通过率未下降' : '新版通过率下降 ' + (df.a.rate - df.b.rate).toFixed(1)}，
          ${df.b.latency <= df.a.latency ? '耗时更优' : '耗时增加'}
        </div>
      </div>
      <div class="card"><div class="t12 muted">用例级变化</div>
        <div class="row"><span class="t13">新增失败</span><span class="t12 bad">${df.new_fail} 条</span></div>
        <div class="row"><span class="t13">已修复</span><span class="t12 ok">${df.fixed} 条</span></div>
        <div class="row"><span class="t13">两版均通过</span><span class="t12 muted">${df.both_pass} 条</span></div>
      </div>
    ` : '<div class="empty">请选择两次运行</div>'}
  `);
}
function diffGo() {
  const a = $('#df-a').value, b = $('#df-b').value;
  location.hash = `#/diff/${$('#df-p').value}?a=${a}&b=${b}`;
  setTimeout(route, 30);
}

/* ================= 8 版本库与共享评测集 ================= */
async function screenLibrary() {
  const d = await get('library');
  const vs = d.versions.map(v => `<div class="item" onclick="location.hash='#/project/${v.project_id}'">
      <div class="row"><span class="t14 semi">${esc(v.label)} · ${esc(v.note || '无备注')}</span>
        <span class="t14 bold ${v.rate >= 85 ? 'ok' : v.rate >= 75 ? 'warn' : v.rate === null ? 'muted' : 'bad'}">${v.rate === null ? '—' : v.rate + '%'}</span></div>
      <div class="meta">${esc(v.project_name)} · 更新于 ${ago(v.created_at)} · ${esc(v.model)}</div>
    </div>`).join('') || '<div class="empty">还没有提示词版本</div>';

  const sh = d.shared.map(s => `<div class="card">
      <div class="t14 semi">${esc(s.name)}</div>
      <div class="t12 muted">${esc(s.author)} · 已被使用 ${s.uses} 次 · ${esc(s.lang)}</div>
      <button class="btn sm" onclick="useShared(${s.id})">导入到我的数据集</button>
    </div>`).join('');

  return shell(`
    <div><h1 class="title">版本库</h1><p class="subtitle">${d.versions.length} 个提示词版本 · ${d.shared.length} 个共享评测集</p></div>
    <div class="sect">提示词版本</div>${vs}
    <div class="sect">共享评测集</div>${sh}
    <button class="btn" onclick="location.hash='#/me'">配置模型密钥</button>
  `);
}
async function useShared(sid) {
  const { projects } = await get('projects');
  if (!projects.length) return toast('请先创建项目');
  const d = await get(`projects/${projects[0].id}`);
  if (!d.datasets.length) return toast('没有可用的数据集');
  try {
    const r = await post(`shared/${sid}/use`, { dataset_id: d.datasets[0].id });
    toast(`已导入 ${r.imported} 条用例`);
    location.hash = `#/dataset/${d.datasets[0].id}`;
    setTimeout(route, 30);
  } catch (e) { toast(e.message); }
}

/* ================= 我的 ================= */
async function screenMe() {
  const k = await get('keys');
  return shell(`
    <div><h1 class="title">我的</h1>
      <p class="subtitle">${esc(state.user.email)} · 积分 ${state.user.credits}</p></div>

    <div class="card"><div class="t12 muted">模型密钥</div>
      ${k.keys.length ? k.keys.map(x => `<div class="row"><span class="t13">${esc(x.label)}</span>
        <span class="t12 dim mono">${esc(x.key_hint || '****')}</span></div>`).join('')
        : '<div class="t12 dim">未配置个人密钥，当前使用服务端兜底密钥</div>'}
      <div class="t12 ${k.has_server_key ? 'ok' : 'warn'}">${k.has_server_key ? '服务端兜底密钥：可用' : '服务端兜底密钥：未配置'}</div>
    </div>

    <div class="card">
      <div class="t12 muted">添加密钥（AES-GCM 加密存储，浏览器永不接触明文）</div>
      <select id="k-prov">${k.providers.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      <input id="k-key" placeholder="API Key" autocomplete="off">
      <input id="k-url" placeholder="自定义 Base URL（仅 custom 需要）">
      <button class="btn sm" onclick="saveKey()">保存并设为默认</button>
    </div>

    <div class="card"><div class="t12 muted">关于</div>
      <div class="t13">PromptOps 把「改提示词」变成可回归的工程动作：同一数据集、同一模型、temperature 0，跑完告诉你通过率涨了还是跌了、跌在哪几条。</div>
      <div class="t12 dim">后端 Cloudflare Pages Functions + D1 · 数据与你共享同一个账号</div>
    </div>
    <button class="btn danger" onclick="doLogout()">退出登录</button>
  `, {});
}
async function saveKey() {
  try {
    await post('keys', {
      provider: $('#k-prov').value, api_key: $('#k-key').value.trim(), base_url: $('#k-url').value.trim()
    });
    toast('密钥已保存'); route();
  } catch (e) { toast(e.message); }
}
async function doLogout() { await post('auth/logout'); state.user = null; location.hash = '#/me'; route(); }

/* ---------------- 启动 ---------------- */
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#tabbar .tab-ico').forEach(el => { el.innerHTML = ICONS[el.dataset.ico]; });
  route();
});
