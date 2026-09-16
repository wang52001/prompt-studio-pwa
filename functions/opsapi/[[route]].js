// PromptOps API：/opsapi/*
import {
  json, err, currentUser, createSession, isEmail, randomToken,
  sessionCookie, clearCookie, maskKey, encryptSecret, decryptSecret
} from '../_lib.js';
import { sendLoginCode, randomCode, sha256 } from '../_mail.js';
import { providerOptions, defaultModel, PROVIDERS } from '../_ai.js';
import {
  executeRun, processChunk, seedIfEmpty, seedShared, safeJson, clusterFailures,
  scorerBreakdown, estimateCost, render
} from '../_ops.js';

const CODE_TTL_MIN = 10, CODE_RESEND_SEC = 60, CODE_MAX_TRY = 5, CODE_HOURLY_LIMIT = 10;

const body = async (r) => {
  try { return await r.json(); } catch { return {}; }
};

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** 校验数据集归属：写操作必须走这里，否则登录用户可往他人数据集塞用例 */
async function ownedDataset(env, userId, did) {
  return env.DB.prepare(
    `SELECT d.* FROM ev_datasets d JOIN ev_projects p ON p.id = d.project_id
     WHERE d.id = ? AND p.user_id = ?`
  ).bind(did, userId).first();
}

export async function onRequest(ctx) {
  const { request, env, params, waitUntil } = ctx;
  const seg = (params.route || []).filter(Boolean);
  const path = seg.join('/');
  const method = request.method;
  const url = new URL(request.url);

  const cors = () => ({
    'Access-Control-Allow-Origin': url.origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

  // 所有响应统一带 CORS（同源部署下主要用于本地调试）
  const ok = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors() }
    });

  try {
    /* ===================== 认证（与 Prompt Studio 共用 users 表） ===================== */
    if (path === 'auth/me') {
      const user = await currentUser(request, env);
      if (user) await seedIfEmpty(env, user.id);
      await seedShared(env);
      return ok({ user });
    }

    if (path === 'auth/send-code' && method === 'POST') {
      const { email } = await body(request);
      const mail = String(email || '').trim().toLowerCase();
      if (!isEmail(mail)) return err('邮箱格式不正确');

      const last = await env.DB.prepare(
        'SELECT created_at FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT 1'
      ).bind(mail).first();
      if (last) {
        const d = await env.DB.prepare(
          "SELECT CAST(strftime('%s','now') - strftime('%s', ?) AS INTEGER) d"
        ).bind(last.created_at).first();
        if ((d?.d ?? 999) < CODE_RESEND_SEC) return err(`请 ${CODE_RESEND_SEC - d.d} 秒后再获取`);
      }
      const hr = await env.DB.prepare(
        "SELECT COUNT(*) n FROM email_codes WHERE email = ? AND created_at > datetime('now','-1 hours')"
      ).bind(mail).first();
      if ((hr?.n || 0) >= CODE_HOURLY_LIMIT) return err('获取过于频繁，请 1 小时后再试');

      const code = randomCode();
      const salt = randomToken(12);
      const hash = await sha256(salt + code);
      await env.DB.prepare('UPDATE email_codes SET consumed = 1 WHERE email = ? AND consumed = 0').bind(mail).run();
      await env.DB.prepare(
        `INSERT INTO email_codes (email, salt, code_hash, expires_at)
         VALUES (?, ?, ?, datetime('now', ?))`
      ).bind(mail, salt, hash, `+${CODE_TTL_MIN} minutes`).run();

      let sent;
      try { sent = await sendLoginCode(env, mail, code); }
      catch (e) { return err('验证码发送失败：' + (e?.message || '邮件服务异常')); }
      if (!sent.ok) return err(sent.error || '验证码发送失败');

      return ok({ ok: true, ttl: CODE_TTL_MIN * 60, ...(sent.devCode ? { dev_code: sent.devCode } : {}) });
    }

    if (path === 'auth/verify-code' && method === 'POST') {
      const { email, code, nickname } = await body(request);
      const mail = String(email || '').trim().toLowerCase();
      if (!isEmail(mail)) return err('邮箱格式不正确');
      if (!/^\d{6}$/.test(String(code || ''))) return err('请输入 6 位数字验证码');

      const row = await env.DB.prepare(
        `SELECT * FROM email_codes WHERE email = ? AND consumed = 0 AND expires_at > datetime('now')
         ORDER BY id DESC LIMIT 1`
      ).bind(mail).first();
      if (!row) return err('验证码已失效，请重新获取', 404);
      if (row.attempts >= CODE_MAX_TRY) return err('尝试次数过多，请重新获取验证码');

      const hash = await sha256(row.salt + String(code));
      if (hash !== row.code_hash) {
        await env.DB.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
        const left = CODE_MAX_TRY - row.attempts - 1;
        return err(left > 0 ? `验证码不正确，还可尝试 ${left} 次` : '验证码不正确，请重新获取');
      }
      await env.DB.prepare('UPDATE email_codes SET consumed = 1 WHERE id = ?').bind(row.id).run();

      let uid;
      const exist = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(mail).first();
      if (exist) uid = exist.id;
      else {
        const nick = String(nickname || '').trim() || mail.split('@')[0] || '工程师';
        const ins = await env.DB.prepare(
          "INSERT INTO users (email, password_hash, salt, nickname, credits) VALUES (?, '', '', ?, 500)"
        ).bind(mail, nick).run();
        uid = ins.meta.last_row_id;
      }
      await seedIfEmpty(env, uid);
      const token = await createSession(env, uid);
      const me = await env.DB.prepare('SELECT id, email, nickname, credits FROM users WHERE id = ?').bind(uid).first();
      return new Response(JSON.stringify({ ok: true, user: me }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': sessionCookie(token), ...cors()
        }
      });
    }

    if (path === 'auth/logout' && method === 'POST') {
      const token = request.headers.get('Cookie')?.match(/sid=([^;]+)/)?.[1];
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': clearCookie(), ...cors() }
      });
    }

    /* ===================== 需要登录的接口 ===================== */
    const user = await currentUser(request, env);
    const guard = () => (!user ? err('请先登录', 401) : null);

    if (path === 'overview') {
      const g = guard(); if (g) return g;
      const { results: projects } = await env.DB.prepare(
        'SELECT * FROM ev_projects WHERE user_id = ? ORDER BY updated_at DESC, id DESC'
      ).bind(user.id).all();

      const items = [];
      let caseTotal = 0, weekRuns = 0, rateSum = 0, rateN = 0;
      for (const p of projects) {
        const last = await env.DB.prepare(
          `SELECT r.*, v.label AS version_label FROM ev_runs r
           LEFT JOIN ev_versions v ON v.id = r.version_id
           WHERE r.project_id = ? ORDER BY r.id DESC LIMIT 1`
        ).bind(p.id).first();
        const prev = last ? await env.DB.prepare(
          `SELECT id, pass, total FROM ev_runs WHERE project_id = ? AND id < ? AND status = 'done'
           ORDER BY id DESC LIMIT 1`
        ).bind(p.id, last.id).first() : null;

        const rate = last && last.total ? (last.pass / last.total) * 100 : null;
        const prevRate = prev && prev.total ? (prev.pass / prev.total) * 100 : null;
        if (rate !== null) { rateSum += rate; rateN++; }
        caseTotal += last?.total || 0;

        items.push({
          id: p.id, name: p.name, description: p.description,
          run_id: last?.id || null, run_no: last ? `#${last.id}` : '未运行',
          model: last?.model || '-', version_label: last?.version_label || '-',
          status: last?.status || 'never',
          rate: rate === null ? null : +rate.toFixed(1),
          delta: (rate !== null && prevRate !== null) ? +(rate - prevRate).toFixed(1) : null,
          finished_at: last?.finished_at || null
        });
      }

      const wk = await env.DB.prepare(
        `SELECT COUNT(*) n FROM ev_runs r JOIN ev_projects p ON p.id = r.project_id
         WHERE p.user_id = ? AND r.started_at > datetime('now','-7 days')`
      ).bind(user.id).first();
      weekRuns = wk?.n || 0;

      const cases = await env.DB.prepare(
        `SELECT COUNT(*) n FROM ev_cases c JOIN ev_datasets d ON d.id = c.dataset_id
         JOIN ev_projects p ON p.id = d.project_id WHERE p.user_id = ?`
      ).bind(user.id).first();

      return ok({
        stats: {
          avg_rate: rateN ? +(rateSum / rateN).toFixed(1) : 0,
          case_total: cases?.n || 0,
          week_runs: weekRuns
        },
        projects: items
      });
    }

    /* ---------- 项目 ---------- */
    if (path === 'projects' && method === 'GET') {
      const g = guard(); if (g) return g;
      const { results } = await env.DB.prepare(
        'SELECT * FROM ev_projects WHERE user_id = ? ORDER BY id DESC'
      ).bind(user.id).all();
      return ok({ projects: results });
    }

    if (path === 'projects' && method === 'POST') {
      const g = guard(); if (g) return g;
      const { name, description, template, system, model } = await body(request);
      if (!String(name || '').trim()) return err('请填写项目名称');
      const p = await env.DB.prepare(
        'INSERT INTO ev_projects (user_id, name, description) VALUES (?, ?, ?)'
      ).bind(user.id, String(name).trim(), String(description || '')).run();
      const pid = p.meta.last_row_id;
      const v = await env.DB.prepare(
        'INSERT INTO ev_versions (project_id, label, note, system, template, model) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(pid, 'V1', '初始版本', String(system || ''),
             String(template || '请处理：{{input}}'), String(model || 'qwen-plus')).run();
      const d = await env.DB.prepare(
        'INSERT INTO ev_datasets (project_id, name, version_label) VALUES (?, ?, ?)'
      ).bind(pid, '默认评测集', 'v1').run();
      await env.DB.prepare('UPDATE ev_projects SET baseline_version_id = ? WHERE id = ?').bind(v.meta.last_row_id, pid).run();
      return ok({ ok: true, id: pid, dataset_id: d.meta.last_row_id, version_id: v.meta.last_row_id });
    }

    if (path.startsWith('projects/') && method === 'GET' && seg.length === 2) {
      const g = guard(); if (g) return g;
      const pid = num(seg[1], 0);
      const project = await env.DB.prepare('SELECT * FROM ev_projects WHERE id = ? AND user_id = ?')
        .bind(pid, user.id).first();
      if (!project) return err('项目不存在', 404);
      const { results: versions } = await env.DB.prepare(
        'SELECT * FROM ev_versions WHERE project_id = ? ORDER BY id DESC'
      ).bind(pid).all();
      const { results: datasets } = await env.DB.prepare(
        'SELECT * FROM ev_datasets WHERE project_id = ? ORDER BY id DESC'
      ).bind(pid).all();
      const { results: runs } = await env.DB.prepare(
        `SELECT r.*, v.label AS version_label FROM ev_runs r
         LEFT JOIN ev_versions v ON v.id = r.version_id
         WHERE r.project_id = ? ORDER BY r.id DESC LIMIT 20`
      ).bind(pid).all();
      return ok({ project, versions, datasets, runs });
    }

    /* ---------- 版本 ---------- */
    if (path === 'versions' && method === 'POST') {
      const g = guard(); if (g) return g;
      const { project_id, label, note, system, template, model, params } = await body(request);
      if (!template) return err('提示词模板不能为空');
      const pid = num(project_id, 0);
      const p = await env.DB.prepare('SELECT id FROM ev_projects WHERE id = ? AND user_id = ?')
        .bind(pid, user.id).first();
      if (!p) return err('项目不存在', 404);
      const r = await env.DB.prepare(
        `INSERT INTO ev_versions (project_id, label, note, system, template, model, params)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(pid, String(label || `V${Date.now() % 1000}`), String(note || ''),
             String(system || ''), String(template), String(model || 'qwen-plus'),
             JSON.stringify(params || {})).run();
      return ok({ ok: true, id: r.meta.last_row_id });
    }

    if (path.startsWith('versions/') && path.endsWith('/online') && method === 'POST') {
      const g = guard(); if (g) return g;
      const vid = num(seg[1], 0);
      const v = await env.DB.prepare(
        `SELECT v.* FROM ev_versions v JOIN ev_projects p ON p.id = v.project_id
         WHERE v.id = ? AND p.user_id = ?`
      ).bind(vid, user.id).first();
      if (!v) return err('版本不存在', 404);
      await env.DB.prepare('UPDATE ev_versions SET is_online = 0 WHERE project_id = ?').bind(v.project_id).run();
      await env.DB.prepare('UPDATE ev_versions SET is_online = 1 WHERE id = ?').bind(vid).run();
      return ok({ ok: true });
    }

    /* ---------- 数据集与用例 ---------- */
    if (path.startsWith('datasets/') && path.endsWith('/cases') && method === 'GET') {
      const g = guard(); if (g) return g;
      const did = num(seg[1], 0);
      const q = url.searchParams.get('q') || '';
      const status = url.searchParams.get('status') || '';
      const ds = await env.DB.prepare(
        `SELECT d.* FROM ev_datasets d JOIN ev_projects p ON p.id = d.project_id
         WHERE d.id = ? AND p.user_id = ?`
      ).bind(did, user.id).first();
      if (!ds) return err('数据集不存在', 404);

      const { results: cases } = await env.DB.prepare(
        `SELECT * FROM ev_cases WHERE dataset_id = ?
         AND (? = '' OR input LIKE '%'||?||'%' OR code LIKE '%'||?||'%')
         ORDER BY seq, id`
      ).bind(did, q, q, q).all();

      // 附带最近一次运行的状态
      const lastRun = await env.DB.prepare(
        'SELECT id FROM ev_runs WHERE dataset_id = ? ORDER BY id DESC LIMIT 1'
      ).bind(did).first();
      let map = {};
      if (lastRun) {
        const { results: rs } = await env.DB.prepare(
          'SELECT case_id, status FROM ev_results WHERE run_id = ?'
        ).bind(lastRun.id).all();
        map = Object.fromEntries(rs.map(r => [r.case_id, r.status]));
      }
      const list = cases
        .map(c => ({ ...c, state: map[c.id] || 'pending' }))
        .filter(c => !status || (status === '未标注' ? c.state === 'pending'
                   : status === '失败' ? c.state === 'fail' : c.state === 'pass'));

      return ok({
        dataset: ds, last_run_id: lastRun?.id || null, cases: list,
        counts: {
          all: cases.length,
          fail: cases.filter(c => map[c.id] === 'fail').length,
          pending: cases.filter(c => !map[c.id] || map[c.id] === 'pending').length
        }
      });
    }

    if (path.startsWith('datasets/') && path.endsWith('/cases') && method === 'POST') {
      const g = guard(); if (g) return g;
      const did = num(seg[1], 0);
      if (!await ownedDataset(env, user.id, did)) return err('数据集不存在', 404);
      const { input, variables, expected, code } = await body(request);
      if (!String(input || '').trim()) return err('用例输入不能为空');
      const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM ev_cases WHERE dataset_id = ?').bind(did).first();
      const r = await env.DB.prepare(
        'INSERT INTO ev_cases (dataset_id, code, seq, input, variables, expected) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(did, String(code || `C${String((cnt?.n || 0) + 1).padStart(3, '0')}`), (cnt?.n || 0) + 1,
             String(input), JSON.stringify(variables || {}), JSON.stringify(expected || {})).run();
      await env.DB.prepare('UPDATE ev_datasets SET case_count = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind((cnt?.n || 0) + 1, did).run();
      return ok({ ok: true, id: r.meta.last_row_id });
    }

    if (path.startsWith('datasets/') && path.endsWith('/import') && method === 'POST') {
      const g = guard(); if (g) return g;
      const did = num(seg[1], 0);
      if (!await ownedDataset(env, user.id, did)) return err('数据集不存在', 404);
      const { rows } = await body(request);
      if (!Array.isArray(rows) || !rows.length) return err('没有可导入的用例');
      const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM ev_cases WHERE dataset_id = ?').bind(did).first();
      let i = cnt?.n || 0;
      const st = await env.DB.prepare(
        'INSERT INTO ev_cases (dataset_id, code, seq, input, variables, expected) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const r of rows.slice(0, 200)) {
        i++;
        await st.bind(did, r.code || `C${String(i).padStart(3, '0')}`, i,
                      String(r.input || ''), JSON.stringify(r.variables || {}),
                      JSON.stringify(r.expected || {})).run();
      }
      await env.DB.prepare("UPDATE ev_datasets SET case_count = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(i, did).run();
      return ok({ ok: true, imported: rows.length });
    }

    if (path.startsWith('cases/') && method === 'DELETE') {
      const g = guard(); if (g) return g;
      const cid = num(seg[1], 0);
      const c = await env.DB.prepare(
        `SELECT c.* FROM ev_cases c JOIN ev_datasets d ON d.id = c.dataset_id
         JOIN ev_projects p ON p.id = d.project_id WHERE c.id = ? AND p.user_id = ?`
      ).bind(cid, user.id).first();
      if (!c) return err('用例不存在', 404);
      await env.DB.prepare('DELETE FROM ev_results WHERE case_id = ?').bind(cid).run();
      await env.DB.prepare('DELETE FROM ev_cases WHERE id = ?').bind(cid).run();
      // 删除后重算计数，否则列表条数与数据集上的 case_count 会长期不一致
      await env.DB.prepare(
        `UPDATE ev_datasets SET case_count =
           (SELECT COUNT(*) FROM ev_cases WHERE dataset_id = ?), updated_at = datetime('now')
         WHERE id = ?`
      ).bind(c.dataset_id, c.dataset_id).run();
      return ok({ ok: true });
    }

    /* ---------- 评测运行 ---------- */
    if (path === 'runs' && method === 'POST') {
      const g = guard(); if (g) return g;
      const { project_id, version_id, dataset_id, model, params, scorers } = await body(request);
      const pid = num(project_id, 0), vid = num(version_id, 0), did = num(dataset_id, 0);
      const p = await env.DB.prepare('SELECT id FROM ev_projects WHERE id = ? AND user_id = ?')
        .bind(pid, user.id).first();
      if (!p) return err('项目不存在', 404);
      if (!vid || !did) return err('请选择提示词版本与数据集');
      // 版本与数据集必须同属该项目，否则可以挂载他人数据集把别人的用例读出来
      const v = await env.DB.prepare(
        'SELECT id FROM ev_versions WHERE id = ? AND project_id = ?'
      ).bind(vid, pid).first();
      if (!v) return err('提示词版本不存在', 404);
      if (!await ownedDataset(env, user.id, did)) return err('数据集不存在', 404);
      const ds = await env.DB.prepare(
        'SELECT id FROM ev_datasets WHERE id = ? AND project_id = ?'
      ).bind(did, pid).first();
      if (!ds) return err('数据集不属于该项目', 404);

      const prev = await env.DB.prepare(
        `SELECT id FROM ev_runs WHERE project_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1`
      ).bind(pid).first();

      const token = randomToken(16);
      const r = await env.DB.prepare(
        `INSERT INTO ev_runs (project_id, version_id, dataset_id, model, params, scorers, prev_run_id, cont_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(pid, vid, did, String(model || 'qwen-plus'), JSON.stringify(params || {}),
             JSON.stringify(scorers || ['rule']), prev?.id || null, token).run();

      const runId = r.meta.last_row_id;
      await env.DB.prepare("UPDATE ev_projects SET updated_at = datetime('now') WHERE id = ?").bind(pid).run();
      waitUntil(executeRun(env, runId, user.id, url.origin).catch(() => {}));
      return ok({ ok: true, id: runId });
    }

    /* 分块续跑：由上一块 self-fetch 触发，新调用会重置子请求计数 */
    if (path.startsWith('runs/') && path.endsWith('/continue') && method === 'POST') {
      const rid = num(seg[1], 0);
      const run = await env.DB.prepare(
        `SELECT r.id, r.cont_token, p.user_id FROM ev_runs r
         JOIN ev_projects p ON p.id = r.project_id WHERE r.id = ?`
      ).bind(rid).first();
      if (!run) return err('运行记录不存在', 404);
      if (!run.cont_token || run.cont_token !== (request.headers.get('x-ops-token') || '')) {
        return err('无效的续跑令牌', 403);
      }
      waitUntil(processChunk(env, rid, run.user_id, url.origin).catch(() => {}));
      return ok({ ok: true });
    }

    if (path === 'runs/preview' && method === 'POST') {
      const g = guard(); if (g) return g;
      const { dataset_id, scorers } = await body(request);
      const did = num(dataset_id, 0);
      if (!await ownedDataset(env, user.id, did)) return err('数据集不存在', 404);
      const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM ev_cases WHERE dataset_id = ?')
        .bind(did).first();
      const n = Math.min(cnt?.n || 0, 200);
      const calls = n * ((scorers || []).includes('llm') ? 2 : 1);
      return ok({
        calls, cases: n,
        seconds: Math.round((calls / 4) * 1.8),
        cost: +estimateCost('qwen-plus', n * 260, n * 90).toFixed(4)
      });
    }

    if (path.startsWith('runs/') && method === 'GET' && seg.length === 2) {
      const g = guard(); if (g) return g;
      const rid = num(seg[1], 0);
      const run = await env.DB.prepare(
        `SELECT r.*, p.name AS project_name, p.user_id, v.label AS version_label, d.name AS dataset_name
         FROM ev_runs r
         JOIN ev_projects p ON p.id = r.project_id
         LEFT JOIN ev_versions v ON v.id = r.version_id
         LEFT JOIN ev_datasets d ON d.id = r.dataset_id
         WHERE r.id = ?`
      ).bind(rid).first();
      if (!run || run.user_id !== user.id) return err('运行记录不存在', 404);
      const { results: results } = await env.DB.prepare(
        `SELECT re.*, c.code, c.input, c.expected, c.variables
         FROM ev_results re JOIN ev_cases c ON c.id = re.case_id
         WHERE re.run_id = ? ORDER BY re.seq`
      ).bind(rid).all();
      return ok({ run, results });
    }

    if (path.startsWith('runs/') && path.endsWith('/stop') && method === 'POST') {
      const g = guard(); if (g) return g;
      const rid = num(seg[1], 0);
      const run = await env.DB.prepare(
        `SELECT r.id FROM ev_runs r JOIN ev_projects p ON p.id = r.project_id
         WHERE r.id = ? AND p.user_id = ?`
      ).bind(rid, user.id).first();
      if (!run) return err('运行记录不存在', 404);
      await env.DB.prepare('UPDATE ev_runs SET stop_flag = 1 WHERE id = ?').bind(rid).run();
      return ok({ ok: true });
    }

    if (path.startsWith('runs/') && path.endsWith('/report') && method === 'GET') {
      const g = guard(); if (g) return g;
      const rid = num(seg[1], 0);
      const run = await env.DB.prepare(
        `SELECT r.*, p.name AS project_name, p.user_id, p.baseline_version_id,
                v.label AS version_label, d.name AS dataset_name
         FROM ev_runs r JOIN ev_projects p ON p.id = r.project_id
         LEFT JOIN ev_versions v ON v.id = r.version_id
         LEFT JOIN ev_datasets d ON d.id = r.dataset_id
         WHERE r.id = ?`
      ).bind(rid).first();
      if (!run || run.user_id !== user.id) return err('运行记录不存在', 404);

      const { results } = await env.DB.prepare('SELECT * FROM ev_results WHERE run_id = ? ORDER BY seq').bind(rid).all();
      const done = results.filter(r => r.status !== 'pending');
      const pass = done.filter(r => r.status === 'pass').length;
      const rate = done.length ? (pass / done.length) * 100 : 0;

      const prev = run.prev_run_id ? await env.DB.prepare(
        'SELECT pass, total, avg_score FROM ev_runs WHERE id = ?'
      ).bind(run.prev_run_id).first() : null;
      const prevRate = prev && prev.total ? (prev.pass / prev.total) * 100 : null;

      // 基线：取与基线版本最近一次成功运行
      let baselineRate = null;
      if (run.baseline_version_id) {
        const b = await env.DB.prepare(
          `SELECT pass, total FROM ev_runs WHERE version_id = ? AND status = 'done'
           AND id != ? ORDER BY id DESC LIMIT 1`
        ).bind(run.baseline_version_id, rid).first();
        if (b && b.total) baselineRate = +((b.pass / b.total) * 100).toFixed(1);
      }

      const scorers = safeJson(run.scorers, []);
      return ok({
        run,
        metrics: {
          rate: +rate.toFixed(1),
          pass, fail: done.length - pass, total: run.total || done.length,
          avg_score: run.avg_score || 0,
          avg_latency: run.avg_latency || 0,
          cost: run.cost || 0
        },
        compare: {
          prev_rate: prevRate === null ? null : +prevRate.toFixed(1),
          delta: prevRate === null ? null : +(rate - prevRate).toFixed(1),
          baseline_rate: baselineRate
        },
        scorers: scorerBreakdown(done, scorers),
        clusters: clusterFailures(done)
      });
    }

    /* ---------- 版本对比 ---------- */
    if (path === 'diff' && method === 'GET') {
      const g = guard(); if (g) return g;
      const a = num(url.searchParams.get('a'), 0), b = num(url.searchParams.get('b'), 0);
      const load = async (id) => {
        const r = await env.DB.prepare(
          `SELECT r.*, p.user_id, v.label AS version_label FROM ev_runs r
           JOIN ev_projects p ON p.id = r.project_id
           LEFT JOIN ev_versions v ON v.id = r.version_id WHERE r.id = ?`
        ).bind(id).first();
        if (!r || r.user_id !== user.id) return null;
        const { results } = await env.DB.prepare(
          'SELECT case_id, status, score FROM ev_results WHERE run_id = ?'
        ).bind(id).all();
        return { run: r, map: Object.fromEntries(results.map(x => [x.case_id, x])) };
      };
      const A = await load(a), B = await load(b);
      if (!A || !B) return err('运行记录不存在', 404);

      const rateOf = (x) => x.run.total ? (x.run.pass / x.run.total) * 100 : 0;
      const ids = new Set([...Object.keys(A.map), ...Object.keys(B.map)]);
      const newFail = [], fixed = [], both = [];
      for (const id of ids) {
        const sa = A.map[id]?.status, sb = B.map[id]?.status;
        if (sa === 'pass' && sb === 'fail') newFail.push(id);
        else if (sa === 'fail' && sb === 'pass') fixed.push(id);
        else if (sa === 'pass' && sb === 'pass') both.push(id);
      }
      return ok({
        a: { id: A.run.id, label: A.run.version_label, rate: +rateOf(A).toFixed(1), score: A.run.avg_score,
             latency: A.run.avg_latency, cost: A.run.cost, total: A.run.total },
        b: { id: B.run.id, label: B.run.version_label, rate: +rateOf(B).toFixed(1), score: B.run.avg_score,
             latency: B.run.avg_latency, cost: B.run.cost, total: B.run.total },
        new_fail: newFail.length, fixed: fixed.length, both_pass: both.length,
        new_fail_codes: newFail.slice(0, 8), fixed_codes: fixed.slice(0, 8)
      });
    }

    /* ---------- 版本库 / 共享评测集 ---------- */
    if (path === 'library' && method === 'GET') {
      const g = guard(); if (g) return g;
      const { results: projects } = await env.DB.prepare(
        'SELECT id, name FROM ev_projects WHERE user_id = ? ORDER BY id DESC'
      ).bind(user.id).all();
      const versions = [];
      for (const p of projects) {
        const { results: vs } = await env.DB.prepare(
          'SELECT * FROM ev_versions WHERE project_id = ? ORDER BY id DESC'
        ).bind(p.id).all();
        for (const v of vs) {
          const r = await env.DB.prepare(
            `SELECT pass, total FROM ev_runs WHERE version_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1`
          ).bind(v.id).first();
          versions.push({
            ...v, project_name: p.name,
            rate: r && r.total ? +((r.pass / r.total) * 100).toFixed(1) : null
          });
        }
      }
      const { results: shared } = await env.DB.prepare('SELECT * FROM ev_shared ORDER BY id').all();
      return ok({ versions, shared });
    }

    if (path.startsWith('shared/') && path.endsWith('/use') && method === 'POST') {
      const g = guard(); if (g) return g;
      const sid = num(seg[1], 0);
      const { dataset_id } = await body(request);
      const s = await env.DB.prepare('SELECT * FROM ev_shared WHERE id = ?').bind(sid).first();
      if (!s) return err('共享集不存在', 404);
      if (!await ownedDataset(env, user.id, num(dataset_id, 0))) return err('数据集不存在', 404);
      const rows = safeJson(s.payload, []);
      const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM ev_cases WHERE dataset_id = ?')
        .bind(num(dataset_id, 0)).first();
      let i = cnt?.n || 0;
      const st = await env.DB.prepare(
        'INSERT INTO ev_cases (dataset_id, code, seq, input, variables, expected) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const r of rows) {
        i++;
        await st.bind(num(dataset_id, 0), r.code || `S${i}`, i, r.input,
                      JSON.stringify(r.variables || {}), JSON.stringify(r.expected || {})).run();
      }
      await env.DB.prepare("UPDATE ev_datasets SET case_count = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(i, num(dataset_id, 0)).run();
      await env.DB.prepare('UPDATE ev_shared SET uses = uses + 1 WHERE id = ?').bind(sid).run();
      return ok({ ok: true, imported: rows.length });
    }

    /* ---------- 模型与密钥 ---------- */
    if (path === 'keys' && method === 'GET') {
      const g = guard(); if (g) return g;
      const { results } = await env.DB.prepare(
        `SELECT id, provider, label, key_hint, model, is_default, status
         FROM user_keys WHERE user_id = ? ORDER BY is_default DESC, id DESC`
      ).bind(user.id).all();
      return ok({ keys: results, providers: providerOptions(), has_server_key: !!env.DASHSCOPE_API_KEY });
    }

    if (path === 'keys' && method === 'POST') {
      const g = guard(); if (g) return g;
      const { provider, api_key, label, base_url, model } = await body(request);
      if (!PROVIDERS[provider]) return err('未知的服务商');
      if (!api_key || String(api_key).length < 8) return err('请填写有效的 API Key');
      const { enc, iv } = await encryptSecret(env, String(api_key));
      await env.DB.prepare('UPDATE user_keys SET is_default = 0 WHERE user_id = ?').bind(user.id).run();
      await env.DB.prepare(
        `INSERT INTO user_keys (user_id, provider, label, key_enc, key_iv, key_hint, base_url, model, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(user.id, provider, label || PROVIDERS[provider].name, enc, iv, maskKey(api_key),
             String(base_url || '').trim(), model || defaultModel(provider) || 'qwen-plus').run();
      return ok({ ok: true });
    }

    return err('接口不存在：' + path, 404);
  } catch (e) {
    return err(e?.message || '服务端异常', 400);
  }
}
