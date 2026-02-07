-- Themes table: Stores each unique theme/model/style combination
CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT UNIQUE NOT NULL,
  theme TEXT NOT NULL,
  model TEXT NOT NULL,
  style TEXT,
  master_prompt TEXT NOT NULL,
  total_tested INTEGER DEFAULT 0,
  rounds_completed INTEGER DEFAULT 0,
  last_tested DATETIME,
  can_generate BOOLEAN DEFAULT FALSE,
  pass_rate DECIMAL(5,2) DEFAULT 0,
  estimated_variations INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Testing elements: All possible elements for each theme
CREATE TABLE IF NOT EXISTS testing_elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT NOT NULL,
  element TEXT NOT NULL,
  element_type TEXT,
  test_order INTEGER NOT NULL,
  tested BOOLEAN DEFAULT FALSE,
  test_result TEXT,
  tested_at DATETIME,
  round_number INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (theme_id) REFERENCES themes(theme_id),
  UNIQUE(theme_id, element)
);

-- Testing sessions: Track each testing session
CREATE TABLE IF NOT EXISTS testing_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT NOT NULL,
  session_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  round_number INTEGER NOT NULL,
  elements_tested INTEGER,
  passed INTEGER,
  failed INTEGER,
  FOREIGN KEY (theme_id) REFERENCES themes(theme_id)
);

-- Production runs: Track production generation sessions
CREATE TABLE IF NOT EXISTS production_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT NOT NULL,
  run_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  prompts_generated INTEGER,
  images_generated INTEGER,
  approved_elements_used TEXT,
  FOREIGN KEY (theme_id) REFERENCES themes(theme_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_testing_elements_theme ON testing_elements(theme_id);
CREATE INDEX IF NOT EXISTS idx_testing_elements_result ON testing_elements(theme_id, test_result);
CREATE INDEX IF NOT EXISTS idx_testing_elements_order ON testing_elements(theme_id, tested, test_order);
CREATE INDEX IF NOT EXISTS idx_testing_sessions_theme ON testing_sessions(theme_id);
CREATE INDEX IF NOT EXISTS idx_production_runs_theme ON production_runs(theme_id);