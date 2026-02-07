-- Fix gallery_images table to allow nullable image_url
-- This allows saving prompts even when image generation fails

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- 1. Create new table with nullable image_url
CREATE TABLE gallery_images_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  theme_id TEXT,
  theme_name TEXT,
  model TEXT,
  prompt TEXT NOT NULL,
  image_url TEXT, -- NOW NULLABLE - allows saving even when FAL.ai fails
  r2_key TEXT,
  tags TEXT, -- JSON array of tags
  favorited BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  bulk_theme_profile_id INTEGER REFERENCES bulk_theme_profiles(id),
  style TEXT -- Add style column from recent updates
);

-- 2. Copy existing data (if any exists)
INSERT INTO gallery_images_new 
SELECT 
  id, batch_id, theme_id, theme_name, model, prompt, image_url, 
  r2_key, tags, favorited, created_at, 
  COALESCE(bulk_theme_profile_id, NULL) as bulk_theme_profile_id,
  NULL as style -- Default null for existing records
FROM gallery_images;

-- 3. Drop old table
DROP TABLE gallery_images;

-- 4. Rename new table
ALTER TABLE gallery_images_new RENAME TO gallery_images;

-- 5. Recreate indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_gallery_batch ON gallery_images(batch_id);
CREATE INDEX IF NOT EXISTS idx_gallery_theme ON gallery_images(theme_id);
CREATE INDEX IF NOT EXISTS idx_gallery_model ON gallery_images(model);
CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_favorited ON gallery_images(favorited);
CREATE INDEX IF NOT EXISTS idx_gallery_images_bulk_theme_profile_id ON gallery_images(bulk_theme_profile_id);