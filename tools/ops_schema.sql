-- PromptOps 评测与回归平台表结构（与 prompt-studio 共库，全部 ev_ 前缀）
-- 复用 users / sessions / user_keys，登录态与密钥体系直接打通

CREATE TABLE IF NOT EXISTS ev_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  baseline_version_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ev_projects_user ON ev_projects(user_id);

-- 提示词版本：每次改动留一个不可变快照，用于版本对比与回滚
CREATE TABLE IF NOT EXISTS ev_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  note TEXT DEFAULT '',
  system TEXT DEFAULT '',
  template TEXT NOT NULL,
  model TEXT DEFAULT 'qwen-plus',
  params TEXT DEFAULT '{}',
  is_online INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ev_versions_project ON ev_versions(project_id);

CREATE TABLE IF NOT EXISTS ev_datasets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  version_label TEXT DEFAULT 'v1',
  case_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ev_datasets_project ON ev_datasets(project_id);

-- 单条用例：expected 是评分规则（JSON），variables 是模板变量（JSON）
CREATE TABLE IF NOT EXISTS ev_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  seq INTEGER DEFAULT 0,
  input TEXT NOT NULL,
  variables TEXT DEFAULT '{}',
  expected TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ev_cases_dataset ON ev_cases(dataset_id);

CREATE TABLE IF NOT EXISTS ev_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  version_id INTEGER NOT NULL,
  dataset_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  params TEXT DEFAULT '{}',
  scorers TEXT DEFAULT '[]',
  status TEXT DEFAULT 'running',
  stop_flag INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  done INTEGER DEFAULT 0,
  pass INTEGER DEFAULT 0,
  fail INTEGER DEFAULT 0,
  avg_score REAL DEFAULT 0,
  avg_latency REAL DEFAULT 0,
  cost REAL DEFAULT 0,
  prev_run_id INTEGER,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ev_runs_project ON ev_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_ev_runs_version ON ev_runs(version_id);

CREATE TABLE IF NOT EXISTS ev_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  case_id INTEGER NOT NULL,
  seq INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  output TEXT DEFAULT '',
  latency_ms INTEGER DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  score REAL DEFAULT 0,
  detail TEXT DEFAULT '{}',
  reason TEXT DEFAULT '',
  error TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ev_results_run ON ev_results(run_id);
CREATE INDEX IF NOT EXISTS idx_ev_results_status ON ev_results(run_id, status);

-- 共享评测集：社区贡献 / 官方维护，payload 存完整用例数组
CREATE TABLE IF NOT EXISTS ev_shared (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  author TEXT DEFAULT '社区贡献',
  kind TEXT DEFAULT 'community',
  case_count INTEGER DEFAULT 0,
  uses INTEGER DEFAULT 0,
  lang TEXT DEFAULT '中文',
  payload TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);
