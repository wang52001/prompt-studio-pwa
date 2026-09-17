-- Prompt Studio 数据库结构（Cloudflare D1 / SQLite）

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  salt          TEXT    NOT NULL,
  nickname      TEXT,
  credits       INTEGER NOT NULL DEFAULT 500,
  streak        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  title         TEXT NOT NULL,
  system_prompt TEXT,
  user_prompt   TEXT,
  variables     TEXT,
  model         TEXT DEFAULT 'qwen-turbo',
  version       INTEGER DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prompts_user ON prompts(user_id, updated_at DESC);

-- 提示词版本历史：每次保存/恢复前快照旧内容（线上由 ensurePromptVersions 幂等创建）
CREATE TABLE IF NOT EXISTS prompt_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id     INTEGER NOT NULL,
  version       INTEGER NOT NULL,
  title         TEXT,
  system_prompt TEXT,
  user_prompt   TEXT,
  variables     TEXT,
  model         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prompt_versions ON prompt_versions(prompt_id, id DESC);

-- 用户自定义预设角色（内置 8 个之外自己加的；线上由 ensureUserRoles 幂等创建）
CREATE TABLE IF NOT EXISTS user_roles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  role_desc  TEXT,
  system     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_roles ON user_roles(user_id, id);

CREATE TABLE IF NOT EXISTS usage (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL,
  model             TEXT,
  prompt_tokens     INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'ok',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gacha_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  rarity     TEXT,
  prize      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bingo_state (
  user_id    INTEGER NOT NULL,
  month      TEXT    NOT NULL,
  cells      TEXT,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, month)
);

CREATE TABLE IF NOT EXISTS arena_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  my_score   REAL,
  ai_score   REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- v3：用户自带 AI 密钥（AES-GCM 加密后存库，永不下发前端）
CREATE TABLE IF NOT EXISTS user_keys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  provider    TEXT    NOT NULL,
  label       TEXT,
  key_enc     TEXT    NOT NULL,
  key_iv      TEXT    NOT NULL,
  key_hint    TEXT,
  base_url    TEXT,
  model       TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'unknown',
  last_error  TEXT,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_keys ON user_keys(user_id, is_default);

-- v2：邮箱验证码登录
CREATE TABLE IF NOT EXISTS email_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL,
  salt       TEXT    NOT NULL,
  code_hash  TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,
  consumed   INTEGER NOT NULL DEFAULT 0,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_codes ON email_codes(email, consumed, expires_at DESC);

-- v4：乐园与社区全部后端化
-- 灵感值流水
CREATE TABLE IF NOT EXISTS credits_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  amount     INTEGER NOT NULL,
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_credits_user ON credits_log(user_id, created_at DESC);

-- 每日打卡（唯一约束保证一天只能签一次）
CREATE TABLE IF NOT EXISTS checkins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  day        TEXT    NOT NULL,
  makeup     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, day)
);

-- 沙雕生成器：词库 + 作品 + 点赞
CREATE TABLE IF NOT EXISTS silly_words (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  text TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS silly_posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  body       TEXT    NOT NULL,
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_silly_hot ON silly_posts(likes DESC, created_at DESC);
CREATE TABLE IF NOT EXISTS silly_likes (
  user_id  INTEGER NOT NULL,
  post_id  INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

-- 成就徽章：定义 + 用户解锁
CREATE TABLE IF NOT EXISTS badge_defs (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  cat       TEXT NOT NULL,
  cond      TEXT NOT NULL,
  legendary INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_badges (
  user_id    INTEGER NOT NULL,
  badge_id   TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, badge_id)
);

-- 每日锦鲤：卡池 + 每日一抽
CREATE TABLE IF NOT EXISTS koi_cards (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  body      TEXT NOT NULL,
  fortune   TEXT NOT NULL,
  festival  TEXT,
  skin      TEXT
);
CREATE TABLE IF NOT EXISTS koi_draws (
  user_id    INTEGER NOT NULL,
  day        TEXT    NOT NULL,
  card_id    INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, day)
);

-- 翻车现场墙
CREATE TABLE IF NOT EXISTS fail_posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  prompt     TEXT    NOT NULL,
  result     TEXT    NOT NULL,
  remark     TEXT,
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fail_hot ON fail_posts(likes DESC, created_at DESC);
CREATE TABLE IF NOT EXISTS fail_likes (
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

-- 社区广场
CREATE TABLE IF NOT EXISTS community_posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  tags       TEXT,
  effect     TEXT,
  likes      INTEGER NOT NULL DEFAULT 0,
  favs       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_hot ON community_posts(likes DESC, created_at DESC);
CREATE TABLE IF NOT EXISTS community_likes (
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS community_favs (
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS community_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_cmt ON community_comments(post_id, created_at);

-- 批量测试
CREATE TABLE IF NOT EXISTS batch_runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT,
  model      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_batch_user ON batch_runs(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS batch_results (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     INTEGER NOT NULL,
  version    TEXT    NOT NULL,
  vars       TEXT,
  output     TEXT,
  score      REAL,
  latency_ms INTEGER,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_batch_res ON batch_results(run_id);

-- 用户偏好（云端同步）
CREATE TABLE IF NOT EXISTS user_settings (
  user_id       INTEGER PRIMARY KEY,
  theme         TEXT DEFAULT 'dark',
  font_size     TEXT DEFAULT 'medium',
  default_model TEXT DEFAULT 'qwen-turbo',
  language      TEXT DEFAULT 'zh-CN',
  notify        INTEGER DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 对话记录（每次 AI 调用的输入输出存档，用于回看与复用）
CREATE TABLE IF NOT EXISTS chat_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  prompt_id  INTEGER,            -- 关联的提示词，调试台自由对话时为 NULL
  title      TEXT,               -- 从最后一条 user 消息截取，列表预览用
  model      TEXT,
  messages   TEXT NOT NULL,      -- JSON 数组
  answer     TEXT,               -- 模型最终输出
  p_tokens   INTEGER DEFAULT 0,
  c_tokens   INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_history ON chat_history(user_id, id);
