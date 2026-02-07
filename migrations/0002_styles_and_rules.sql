-- Styles/Master Prompts table
CREATE TABLE IF NOT EXISTS styles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  model TEXT NOT NULL,
  master_prompt TEXT NOT NULL,
  is_custom BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default styles
INSERT OR IGNORE INTO styles (name, model, master_prompt) VALUES
('Gritty iPhone Realism', 'SEED_DREAM', 'low quality, extreme grain, raw, Shaky iPhone candid video still of [subject] [action]'),
('Clean Animation', 'IMAGEN_4', '[subject] [action] [location], in clean animation style'),
('Tier-1 Celebrity Realism', 'SEED_DREAM', 'professional photo of [subject] [action], celebrity photoshoot style');

-- Scaling rules table
CREATE TABLE IF NOT EXISTS scaling_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT NOT NULL,
  rule_type TEXT NOT NULL, -- 'avoid', 'limit', 'require', 'blacklist'
  rule_value TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (theme_id) REFERENCES themes(theme_id)
);

-- Scaling notes table  
CREATE TABLE IF NOT EXISTS scaling_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (theme_id) REFERENCES themes(theme_id)
);

-- Scaling sessions table
CREATE TABLE IF NOT EXISTS scaling_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT NOT NULL,
  session_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  variety_level TEXT, -- 'low', 'medium', 'high'
  batch_size INTEGER,
  total_generated INTEGER,
  pass_rate DECIMAL(5,2),
  output_type TEXT, -- 'prompts_only', 'prompts_and_images'
  FOREIGN KEY (theme_id) REFERENCES themes(theme_id)
);

-- Refinement attempts table
CREATE TABLE IF NOT EXISTS refinement_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT NOT NULL,
  element TEXT NOT NULL,
  attempt_number INTEGER,
  refined_prompt TEXT,
  test_result TEXT, -- 'pass', 'fail', 'blacklisted'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (theme_id) REFERENCES themes(theme_id)
);

-- Update themes table to include style reference
ALTER TABLE themes ADD COLUMN style_id INTEGER REFERENCES styles(id);
ALTER TABLE themes ADD COLUMN description TEXT;