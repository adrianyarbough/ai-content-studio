-- Store test images for persistence
CREATE TABLE IF NOT EXISTS test_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT NOT NULL,
  element TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  round_number INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (theme_id) REFERENCES themes(theme_id),
  UNIQUE(theme_id, element, round_number)
);

-- Add generated_prompt column to testing_elements
ALTER TABLE testing_elements ADD COLUMN generated_prompt TEXT;

-- Add image_url column to testing_elements 
ALTER TABLE testing_elements ADD COLUMN image_url TEXT;

-- Production sessions for mass generation
CREATE TABLE IF NOT EXISTS production_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id TEXT NOT NULL,
  session_name TEXT,
  total_images INTEGER,
  completed_images INTEGER DEFAULT 0,
  failed_images INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending, running, paused, completed, failed
  model TEXT NOT NULL,
  cost_estimate REAL,
  actual_cost REAL,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (theme_id) REFERENCES themes(theme_id)
);

-- Generated images for production
CREATE TABLE IF NOT EXISTS generated_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  image_url TEXT,
  storage_path TEXT,
  thumbnail_path TEXT,
  model TEXT,
  generation_time REAL,
  status TEXT DEFAULT 'queued', -- queued, generating, completed, failed
  error_message TEXT,
  batch_number INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES production_sessions(id)
);

-- Generation queue for batch processing
CREATE TABLE IF NOT EXISTS generation_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  batch_number INTEGER,
  prompts TEXT, -- JSON array of prompts
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES production_sessions(id)
);