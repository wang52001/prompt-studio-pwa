// PromptOps 评测引擎（下划线开头，不会被当作路由）
// 职责：提示词渲染、评分器、模型调用、评测执行与报告聚合

import { decryptSecret, logUsage } from './_lib.js';
import { resolveEndpoint } from './_ai.js';

/* ============================ 价格表（¥ / 百万 token） ============================ */
const PRICE = {
  'qwen-turbo': [0.3, 0.6], 'qwen-plus': [0.8, 2.0], 'qwen-max': [20, 60],
  'deepseek-chat': [2, 8], 'deepseek-reasoner': [4, 16],
  'glm-4-flash': [0, 0], 'glm-4-plus': [50, 50],
  'gpt-4o-mini': [1.1, 4.4], 'gpt-4o': [20, 60],
  'moonshot-v1-8k': [12, 12], 'moonshot-v1-32k': [24, 24]
};
/** 估算成本（元）；未知模型按 qwen-plus 计 */
export function estimateCost(model, tin, tout) {
  const [pi, po] = PRICE[model] || PRICE['qwen-plus'];
  return +((tin * pi + tout * po) / 1_000_000).toFixed(6);
}

/* ============================ 模板渲染 ============================ */
/** 支持 {{var}} 与 ${var} 两种写法 */
export function render(tpl, vars = {}) {
  return String(tpl || '')
    .replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => (vars[k] ?? m))
    .replace(/\$\{\s*([\w.-]+)\s*\}/g, (m, k) => (vars[k] ?? m));
}

/* ============================ 评分器 ============================ */
/**
 * 规则断言：expected 形如
 * { contains: ['保温'], maxLen: 20, minLen: 1, regex: '...', notContains: ['促销'] }
 */
export function ruleScore(output, expected = {}) {
  const out = String(output || '');
  const reasons = [];
  let ok = true;

  const list = expected.contains || [];
  for (const w of list) {
    if (!out.includes(w)) { ok = false; reasons.push(`缺少关键词「${w}」`); }
  }
  for (const w of (expected.notContains || [])) {
    if (out.includes(w)) { ok = false; reasons.push(`出现禁用词「${w}」`); }
  }
  if (expected.maxLen && out.length > expected.maxLen) {
    ok = false; reasons.push(`超出字数上限 ${out.length - expected.maxLen} 字`);
  }
  if (expected.minLen && out.length < expected.minLen) {
    ok = false; reasons.push(`内容过短，少于 ${expected.minLen} 字`);
  }
  if (expected.regex) {
    try {
      if (!new RegExp(expected.regex).test(out)) { ok = false; reasons.push('正则未命中'); }
    } catch { /* 正则非法则跳过 */ }
  }
  return { pass: ok, reasons };
}

/** JSON Schema 校验：只覆盖 type / required / properties 的常用子集 */
export function schemaScore(output, schema = {}) {
  let data;
  try {
    const s = String(output || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
    data = JSON.parse(s);
  } catch {
    return { pass: false, reasons: ['输出不是合法 JSON'] };
  }
  const reasons = [];
  if (schema.type === 'object' && (typeof data !== 'object' || Array.isArray(data))) {
    reasons.push('类型应为 object');
  }
  for (const k of (schema.required || [])) {
    if (!(k in (data || {}))) reasons.push(`缺少字段 ${k}`);
  }
  const props = schema.properties || {};
  for (const [k, rule] of Object.entries(props)) {
    if (!(k in (data || {}))) continue;
    const v = data[k];
    if (rule.type === 'string' && typeof v !== 'string') reasons.push(`${k} 应为 string`);
    if (rule.type === 'number' && typeof v !== 'number') reasons.push(`${k} 应为 number`);
    if (rule.type === 'boolean' && typeof v !== 'boolean') reasons.push(`${k} 应为 boolean`);
    if (rule.enum && !rule.enum.includes(v)) reasons.push(`${k} 取值不在枚举内`);
  }
  return { pass: reasons.length === 0, reasons };
}

/** 组装 LLM 裁判的打分提示词 */
/* 裁判必须有扣分规则，否则模型只会输出 0 或 10，评分器就失去了区分度 */
const JUDGE_TMPL = (input, expected, output) =>
`你是严格的评测裁判，请按扣分规则打分，不要只给 0 分或 10 分。

【任务输入】
${input}

【硬性要求】
${expected}

【模型输出】
${output}

【评分规则】从 10 分起扣：
- 每违反一条硬性要求，扣 3 分
- 表达生硬、语病或冗余，扣 1–2 分
- 语气与要求不符，扣 1–2 分
- 扣完为止，最低 0 分

只输出一行 JSON，不要任何解释：
{"score": <0-10 的整数>, "reason": "<不超过 40 字的中文扣分说明>"}`;

const JUDGE_SYSTEM = '你是客观、稳定的评测裁判，只输出 JSON。';

/* ============================ 模型调用 ============================ */

/** 取用户的默认密钥（已解密）；无则返回 null，由调用方回落到服务端密钥 */
export async function userKey(env, userId) {
  const row = await env.DB.prepare(
    `SELECT provider, key_enc, key_iv, base_url, model FROM user_keys
     WHERE user_id = ? AND status = 'ok' ORDER BY is_default DESC, id DESC LIMIT 1`
  ).bind(userId).first();
  if (!row) return null;
  try {
    return {
      key: await decryptSecret(env, row.key_enc, row.key_iv),
      endpoint: resolveEndpoint(row.provider, row.base_url),
      model: row.model
    };
  } catch {
    return null; // 密钥解密失败（如加密密钥轮换）→ 回落服务端密钥
  }
}

function serverKey(env) {
  const k = env.DASHSCOPE_API_KEY;
  if (!k) return null;
  return {
    key: k,
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus'
  };
}

/** 统一 chat 调用，返回 { text, tokensIn, tokensOut, latencyMs } */
export async function chat(env, { endpoint, key, model }, messages, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 800
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`模型调用失败 ${r.status}：${t.slice(0, 180)}`);
  }
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content ?? '';
  return {
    text,
    tokensIn: j?.usage?.prompt_tokens || 0,
    tokensOut: j?.usage?.completion_tokens || 0,
    latencyMs: Date.now() - t0
  };
}

/* ============================ 单条用例执行 ============================ */
async function runOneCase(env, cfg, version, c, scorers, userId) {
  const vars = safeJson(c.variables, {});
  const expected = safeJson(c.expected, {});
  const messages = [];
  if (version.system) messages.push({ role: 'system', content: render(version.system, vars) });
  messages.push({ role: 'user', content: render(version.template, vars) });

  const t0 = Date.now();
  const r = await chat(env, cfg, messages, { temperature: 0 });
  const output = r.text;
  let tokensIn = r.tokensIn, tokensOut = r.tokensOut;

  const detail = {};
  let pass = true, score = 0, judgeReason = '';

  if (scorers.includes('rule')) {
    const s = ruleScore(output, expected.rule || expected);
    detail.rule = s;
    if (!s.pass) pass = false;
  }
  if (scorers.includes('schema')) {
    const s = schemaScore(output, expected.schema || {});
    detail.schema = s;
    if (!s.pass) pass = false;
  }
  if (scorers.includes('llm')) {
    try {
      const j = await chat(env, cfg, [
        { role: 'system', content: JUDGE_SYSTEM },
        { role: 'user', content: JUDGE_TMPL(c.input, expected.human || JSON.stringify(expected, null, 0), output) }
      ], { temperature: 0 });
      tokensIn += j.tokensIn; tokensOut += j.tokensOut;
      const m = String(j.text).match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : {};
      const sc = Math.max(0, Math.min(10, Number(parsed.score) || 0));
      detail.llm = { score: sc, reason: parsed.reason || '' };
      judgeReason = parsed.reason || '';
      score = sc;
      if (sc < 6) pass = false;
    } catch (e) {
      detail.llm = { score: 0, reason: '裁判调用失败' };
      judgeReason = String(e.message || e).slice(0, 120);
    }
  }

  const latency = Date.now() - t0;
  await logUsage(env, userId, cfg.model, { prompt_tokens: tokensIn, completion_tokens: tokensOut });

  return {
    status: pass ? 'pass' : 'fail',
    output,
    latency,
    tokensIn,
    tokensOut,
    cost: estimateCost(cfg.model, tokensIn, tokensOut),
    score,
    detail,
    reason: judgeReason || collectReasons(detail)
  };
}

function collectReasons(detail) {
  const out = [];
  for (const v of Object.values(detail || {})) {
    if (v?.reasons) out.push(...v.reasons);
  }
  return out.join('；');
}

export const safeJson = (s, d) => {
  try { return JSON.parse(s || '') ?? d; } catch { return d; }
};

/* ============================ 评测执行（后台） ============================ */
const CONCURRENCY = 4;
const MAX_CASES = 200;

/**
 * Cloudflare 单个 Worker 调用最多 50 次外部请求（含每次模型调用）。
 * 一次跑 30 条 × 2 次调用（生成 + 裁判）必然超限，所以按块执行：
 * 每块跑完用一次 self-fetch 触发下一块，新调用会重置子请求计数。
 */
const CHUNK_WITH_JUDGE = 12;   // 12 × 2 + 1 = 25 次
const CHUNK_RULE_ONLY  = 20;   // 20 × 1 + 1 = 21 次
const chunkSize = (scorers) => (scorers.includes('llm') ? CHUNK_WITH_JUDGE : CHUNK_RULE_ONLY);

export async function executeRun(env, runId, userId, origin) {
  const run = await env.DB.prepare('SELECT * FROM ev_runs WHERE id = ?').bind(runId).first();
  if (!run) return;
  const { results: cases } = await env.DB.prepare(
    'SELECT * FROM ev_cases WHERE dataset_id = ? ORDER BY seq, id LIMIT ?'
  ).bind(run.dataset_id, MAX_CASES).all();

  const scorers = safeJson(run.scorers, []);
  const params = safeJson(run.params, {});

  // 密钥：优先用户自带，回落服务端
  const uk = await userKey(env, userId);
  const cfg = uk
    ? { endpoint: uk.endpoint, key: uk.key, model: params.model || run.model }
    : { ...(serverKey(env) || {}), model: params.model || run.model };
  if (!cfg.key) return finish(env, runId, 'no_key');

  await env.DB.prepare('UPDATE ev_runs SET total = ? WHERE id = ?').bind(cases.length, runId).run();

  // 预建 pending 结果行：既是"未跑"状态，也是分块续跑的游标
  for (let i = 0; i < cases.length; i++) {
    await env.DB.prepare(
      'INSERT INTO ev_results (run_id, case_id, seq, status) VALUES (?, ?, ?, ?)'
    ).bind(runId, cases[i].id, i, 'pending').run();
  }

  return processChunk(env, runId, userId, origin);
}

/** 处理一块用例；跑完若还有 pending，就用一次 self-fetch 触发下一块 */
export async function processChunk(env, runId, userId, origin) {
  const run = await env.DB.prepare('SELECT * FROM ev_runs WHERE id = ?').bind(runId).first();
  if (!run || run.status !== 'running') return;
  if (run.stop_flag) return finish(env, runId, 'stopped');

  const version = await env.DB.prepare('SELECT * FROM ev_versions WHERE id = ?').bind(run.version_id).first();
  const scorers = safeJson(run.scorers, []);
  const params = safeJson(run.params, {});
  const size = chunkSize(scorers);

  const uk = await userKey(env, userId);
  const cfg = uk
    ? { endpoint: uk.endpoint, key: uk.key, model: params.model || run.model }
    : { ...(serverKey(env) || {}), model: params.model || run.model };
  if (!cfg.key) return finish(env, runId, 'no_key');

  const { results: pending } = await env.DB.prepare(
    `SELECT re.id AS rid, re.seq, c.* FROM ev_results re
     JOIN ev_cases c ON c.id = re.case_id
     WHERE re.run_id = ? AND re.status = 'pending' ORDER BY re.seq LIMIT ?`
  ).bind(runId, size).all();
  if (!pending.length) return finish(env, runId, 'done');

  let idx = 0;
  const worker = async () => {
    for (;;) {
      const i = idx++;
      if (i >= pending.length) return;
      const c = pending[i];

      let row = { status: 'fail', output: '', latency: 0, tokensIn: 0, tokensOut: 0, cost: 0, score: 0, detail: {}, reason: '', error: '' };
      try {
        row = await runOneCase(env, cfg, version, c, scorers, userId);
      } catch (e) {
        row.status = 'fail';
        row.error = String(e.message || e).slice(0, 200);
        row.reason = row.error;
      }

      await env.DB.prepare(
        `UPDATE ev_results SET status = ?, output = ?, latency_ms = ?, tokens_in = ?,
         tokens_out = ?, cost = ?, score = ?, detail = ?, reason = ?, error = ?
         WHERE id = ?`
      ).bind(row.status, row.output, row.latency, row.tokensIn, row.tokensOut,
             row.cost, row.score, JSON.stringify(row.detail || {}), row.reason || '', row.error || '',
             c.rid).run();

      // 累计值改为增量累加，避免分块之间互相覆盖
      await env.DB.prepare(
        `UPDATE ev_runs SET done = done + 1,
           pass = pass + ?, fail = fail + ?,
           cost = cost + ?,
           avg_score = (avg_score * done + ?) / (done + 1),
           avg_latency = (avg_latency * done + ?) / (done + 1)
         WHERE id = ?`
      ).bind(row.status === 'pass' ? 1 : 0, row.status === 'pass' ? 0 : 1,
             row.cost, row.score, row.latency, runId).run();
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const left = await env.DB.prepare(
    'SELECT COUNT(*) n FROM ev_results WHERE run_id = ? AND status = ?'
  ).bind(runId, 'pending').first();
  const stopped = await env.DB.prepare('SELECT stop_flag FROM ev_runs WHERE id = ?').bind(runId).first();

  if ((left?.n || 0) > 0 && !stopped?.stop_flag) {
    // 一次 self-fetch 开启新的调用，重置子请求计数
    try {
      await fetch(`${origin}/opsapi/runs/${runId}/continue`, {
        method: 'POST',
        headers: { 'x-ops-token': run.cont_token || '' },
        body: '{}'
      });
      return;
    } catch { /* 续跑失败则按当前结果收尾 */ }
  }
  return finish(env, runId, stopped?.stop_flag ? 'stopped' : 'done');
}

async function finish(env, runId, status) {
  await env.DB.prepare(
    "UPDATE ev_runs SET status = ?, finished_at = datetime('now') WHERE id = ?"
  ).bind(status, runId).run();
}

/* ============================ 报告聚合 ============================ */
export function clusterFailures(results) {
  const buckets = {};
  for (const r of results) {
    if (r.status !== 'fail') continue;
    const d = safeJson(r.detail, {});
    let label = '其他';
    if (d.rule?.reasons?.length) {
      const first = d.rule.reasons[0];
      if (first.includes('超出字数')) label = '输出超过字数上限';
      else if (first.includes('缺少关键词')) label = '缺少指定关键词';
      else if (first.includes('禁用词')) label = '出现禁用词';
      else if (first.includes('正则')) label = '正则未命中';
      else label = '规则断言未通过';
    } else if (d.schema?.reasons?.length) {
      label = d.schema.reasons[0].includes('JSON') ? '输出不是合法 JSON' : '结构字段不符合 Schema';
    } else if (d.llm && d.llm.score < 6) {
      label = '裁判评分过低（< 6 分）';
    } else if (r.error) {
      label = '模型调用异常';
    }
    buckets[label] = (buckets[label] || 0) + 1;
  }
  return Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

/** 按评分器维度算通过率 */
export function scorerBreakdown(results, scorers) {
  const out = [];
  const n = results.length || 1;
  if (scorers.includes('rule')) {
    const ok = results.filter(r => safeJson(r.detail, {}).rule?.pass).length;
    out.push({ name: '规则断言', value: `${((ok / n) * 100).toFixed(1)}%`, rate: +(ok / n).toFixed(3) });
  }
  if (scorers.includes('schema')) {
    const ok = results.filter(r => safeJson(r.detail, {}).schema?.pass).length;
    out.push({ name: 'JSON Schema 校验', value: `${((ok / n) * 100).toFixed(1)}%`, rate: +(ok / n).toFixed(3) });
  }
  if (scorers.includes('llm')) {
    const withScore = results.filter(r => safeJson(r.detail, {}).llm?.score);
    const avg = withScore.length
      ? withScore.reduce((s, r) => s + safeJson(r.detail, {}).llm.score, 0) / withScore.length : 0;
    out.push({ name: 'LLM 裁判均分', value: `${avg.toFixed(1)} / 10`, rate: +(avg / 10).toFixed(3) });
  }
  return out;
}

/* ============================ 首次登录的种子数据 ============================ */
/* [商品, 卖点, 语气, 必须出现的关键词]
   关键点：输入里必须把卖点说清楚，否则模型只能猜，测出来的低分是数据集的锅，不是提示词的锅 */
const SEED_CASES = [
  ['保温杯', '12 小时保温', '幽默', '保温'], ['便携咖啡机', '30 秒出杯', '幽默', '咖啡'],
  ['真无线耳机', '主动降噪', '专业', '降噪'], ['机械键盘', '敲击手感', '专业', '手感'],
  ['空气炸锅', '无油低脂', '亲切', '无油'], ['电动牙刷', '深层清洁', '专业', '清洁'],
  ['冲锋衣', '暴雨防水', '硬核', '防水'], ['循环扇', '静音送风', '亲切', '静音'],
  ['智能手表', '14 天续航', '专业', '续航'], ['人体工学椅', '护腰支撑', '亲切', '腰'],
  ['充电宝', '超大电量', '幽默', '电量'], ['无线鼠标', '精准定位', '专业', '精准'],
  ['加湿器', '温润不干燥', '亲切', '润'], ['扫地机器人', '自动清扫', '幽默', '干净'],
  ['投影仪', '4K 清晰', '硬核', '清晰'], ['筋膜枪', '深层放松', '硬核', '放松'],
  ['保温饭盒', '6 小时保温', '亲切', '保温'], ['降噪耳罩', '深度降噪', '专业', '降噪'],
  ['电动滑板车', '40 公里续航', '硬核', '续航'], ['智能门锁', '金融级安全', '专业', '安全'],
  ['露营灯', '360 度照明', '亲切', '照明'], ['破壁机', '细腻无渣', '亲切', '细腻'],
  ['颈椎按摩仪', '舒服解压', '幽默', '舒服'], ['游戏手柄', '零延迟响应', '硬核', '响应'],
  ['防晒衣', 'UPF50 防晒', '亲切', '防晒'], ['空气净化器', '高效净化', '专业', '净化'],
  ['蒸汽拖把', '高温杀菌', '幽默', '杀菌'], ['蓝牙音箱', '澎湃低音', '硬核', '低音'],
  ['智能猫砂盆', '全自动铲屎', '幽默', '自动'], ['折叠电动车', '轻便可折叠', '专业', '轻便']
];

export async function seedIfEmpty(env, userId) {
  const p = await env.DB.prepare('SELECT COUNT(*) n FROM ev_projects WHERE user_id = ?').bind(userId).first();
  if ((p?.n || 0) > 0) return false;

  const proj = await env.DB.prepare(
    'INSERT INTO ev_projects (user_id, name, description) VALUES (?, ?, ?)'
  ).bind(userId, '商品文案生成', '为电商商品生成一句广告语，要求包含卖点词且不超过 20 字').run();
  const pid = proj.meta.last_row_id;

  const v1 = await env.DB.prepare(
    `INSERT INTO ev_versions (project_id, label, note, system, template, model)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(pid, 'V1', '简洁版', '',
    '为{{product}}写一句广告语，突出{{point}}，语气{{style}}。只输出广告语本身。', 'qwen-plus').run();

  const v2 = await env.DB.prepare(
    `INSERT INTO ev_versions (project_id, label, note, system, template, model, params)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(pid, 'V2', '带角色设定',
    '你是一位有 10 年经验的电商文案总监，擅长用一句话打动人心。',
    '请为{{product}}写一句广告语，突出{{point}}，语气{{style}}。\n要求：不超过 20 字，只输出广告语本身，不要引号、不要解释。',
    'qwen-plus', JSON.stringify({ temperature: 0 })).run();

  const v3 = await env.DB.prepare(
    `INSERT INTO ev_versions (project_id, label, note, system, template, model, params, is_online)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(pid, 'V3', '硬约束版',
    '你是电商文案专家，输出必须严格满足格式约束。',
    '为{{product}}写一句广告语。\n硬约束：必须出现「{{point}}」相关词；不超过 20 字；只输出广告语本身。\n语气：{{style}}',
    'qwen-plus', JSON.stringify({ temperature: 0 })).run();

  await env.DB.prepare('UPDATE ev_projects SET baseline_version_id = ? WHERE id = ?')
    .bind(v1.meta.last_row_id, pid).run();

  const ds = await env.DB.prepare(
    'INSERT INTO ev_datasets (project_id, name, version_label, case_count) VALUES (?, ?, ?, ?)'
  ).bind(pid, '商品文案 · 评测集', 'v3', SEED_CASES.length).run();
  const did = ds.meta.last_row_id;

  const st = await env.DB.prepare(
    'INSERT INTO ev_cases (dataset_id, code, seq, input, variables, expected) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (let i = 0; i < SEED_CASES.length; i++) {
    const [product, point, style, keyword] = SEED_CASES[i];
    await st.bind(did, `C${String(i + 1).padStart(3, '0')}`, i + 1,
      `为${product}写一句广告语，突出${point}，语气${style}`,
      JSON.stringify({ product, point, style }),
      JSON.stringify({ rule: { contains: [keyword], maxLen: 20 }, human: `包含「${keyword}」且不超过 20 字` })
    ).run();
  }
  return true;
}

export async function seedShared(env) {
  const n = await env.DB.prepare('SELECT COUNT(*) n FROM ev_shared').first();
  if ((n?.n || 0) > 0) return;

  const intent = [
    '我的订单什么时候发货', '能便宜点吗', '这个尺码偏大吗', '我要退货',
    '发票怎么开', '快递显示已签收但我没收到', '支持七天无理由吗', '优惠券为什么用不了',
    '怎么修改收货地址', '商品有货吗', '能开发票吗', '申请换货流程',
    '退款多久到账', '商品和描述不一样', '怎么联系人工客服'
  ].map((q, i) => ({ code: `I${String(i + 1).padStart(3, '0')}`, input: q, expected: { rule: { maxLen: 10 } } }));

  const typo = [
    '我今天去超巿买东西', '这个问提很重要', '他按排了会议', '请再接再励',
    '这件事不容质疑', '他的表杨让我开心', '天气真令热', '我们必需努力'
  ].map((q, i) => ({ code: `T${String(i + 1).padStart(3, '0')}`, input: q, expected: { rule: { maxLen: 50 } } }));

  await env.DB.prepare(
    `INSERT INTO ev_shared (name, description, author, kind, case_count, uses, lang, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind('客服意图分类 · 300 条', '覆盖售后、物流、优惠等高频意图，含中英双语',
         '社区贡献', 'community', 300, 128, '中英双语', JSON.stringify(intent)).run();

  await env.DB.prepare(
    `INSERT INTO ev_shared (name, description, author, kind, case_count, uses, lang, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind('中文错别字纠错 · 320 条', '常见同音/形近错别字，官方每周更新',
         '官方维护', 'official', 320, 64, '中文', JSON.stringify(typo)).run();
}
