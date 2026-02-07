-- Gallery system for storing and organizing production images
CREATE TABLE IF NOT EXISTS gallery_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  theme_id TEXT,
  theme_name TEXT,
  model TEXT,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  r2_key TEXT,
  tags TEXT, -- JSON array of tags
  favorited BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_gallery_batch ON gallery_images(batch_id);
CREATE INDEX IF NOT EXISTS idx_gallery_theme ON gallery_images(theme_id);
CREATE INDEX IF NOT EXISTS idx_gallery_model ON gallery_images(model);
CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_favorited ON gallery_images(favorited);

-- Gallery collections for organizing images
CREATE TABLE IF NOT EXISTS gallery_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cover_image_id) REFERENCES gallery_images(id)
);

-- Many-to-many relationship between collections and images
CREATE TABLE IF NOT EXISTS collection_images (
  collection_id INTEGER,
  image_id INTEGER,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, image_id),
  FOREIGN KEY (collection_id) REFERENCES gallery_collections(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES gallery_images(id) ON DELETE CASCADE
);