-- =========================================================
-- 七年四班 · D1 建表脚本
-- 用法：Cloudflare 控制台 → D1 SQL database → 选中库 → 控制台/SQL 标签
--       把本文件全部内容粘进去，点 Execute
-- 重复执行不会报错（都是 IF NOT EXISTS）
-- =========================================================

-- 账户（老师/你/其他人都是这里的一行）
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,          -- a_xxx
  user       TEXT UNIQUE NOT NULL,      -- 登录名，如 温泊 / 郭老师
  name       TEXT,                      -- 显示名
  level      TEXT NOT NULL,             -- high / mid / junior / member
  pass       TEXT NOT NULL,             -- pbkdf2$迭代次数$salt$hash
  created_at TEXT
);

-- 登录后发出去的令牌
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_acc ON sessions(account_id);

-- 班级成员（举报结果要按“所属中管”回传，就靠 owner）
CREATE TABLE IF NOT EXISTS members (
  id    TEXT PRIMARY KEY,               -- 2404-18
  name  TEXT,
  role  TEXT,                           -- member / teacher / junior / mid / high
  owner TEXT,                           -- 负责这个成员的中管账户 id（可空）
  muted INTEGER DEFAULT 0,              -- 1 = 禁言
  banned INTEGER DEFAULT 0              -- 1 = 封禁
);

-- 举报单
CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  from_id      TEXT,                    -- 举报人账户 id
  from_name    TEXT,
  from_level   TEXT,
  target_type  TEXT,                    -- post / member / comment
  target_id    TEXT,                    -- 动态 id 或成员 id
  target_name  TEXT,                    -- 方便人看：谁发的 / 谁
  reason       TEXT NOT NULL,           -- 举报理由
  images       TEXT,                    -- JSON 数组，dataURL，最多 2 张
  status       TEXT NOT NULL,           -- pending / ok / no
  handler_id   TEXT,
  handler_name TEXT,
  action       TEXT,                    -- 处理动作：警告 / 禁言 / 删除内容 / 无
  note         TEXT,                    -- 处理说明
  created_at   TEXT,
  handled_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_from   ON reports(from_id);

-- 审计日志
CREATE TABLE IF NOT EXISTS logs (
  id      TEXT PRIMARY KEY,
  at      TEXT,
  actor   TEXT,
  level   TEXT,
  text    TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_at ON logs(at);
