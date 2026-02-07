-- Deployment Logs System
-- Adds table for tracking real-time bulk deployment progress and logging

CREATE TABLE IF NOT EXISTS deployment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  step_type TEXT NOT NULL, -- 'deployment_start', 'theme_start', 'theme_completed', 'theme_error', 'deployment_completed', 'deployment_error'
  message TEXT NOT NULL,
  metadata TEXT, -- JSON string with additional data (theme info, stats, etc.)
  log_level TEXT DEFAULT 'info' CHECK (log_level IN ('info', 'warning', 'error', 'success')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient log querying by session
CREATE INDEX IF NOT EXISTS idx_deployment_logs_session_id ON deployment_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_step_type ON deployment_logs(step_type);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_created_at ON deployment_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_logs_session_created ON deployment_logs(session_id, created_at DESC);

-- Optional: Add a composite index for session + step type for filtering
CREATE INDEX IF NOT EXISTS idx_deployment_logs_session_step ON deployment_logs(session_id, step_type);