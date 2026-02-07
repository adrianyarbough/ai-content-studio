-- Gallery videos table for storing generated videos
CREATE TABLE IF NOT EXISTS gallery_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_image_id INTEGER,
  theme_id TEXT,
  video_url TEXT NOT NULL,
  prompt TEXT,
  aspect_ratio TEXT DEFAULT '16:9',
  resolution TEXT DEFAULT '720p',
  duration TEXT DEFAULT '5',
  style TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gallery_image_id) REFERENCES gallery_images(id)
);

-- Index for fast video queries
CREATE INDEX IF NOT EXISTS idx_gallery_videos_image ON gallery_videos(gallery_image_id);
CREATE INDEX IF NOT EXISTS idx_gallery_videos_theme ON gallery_videos(theme_id);
CREATE INDEX IF NOT EXISTS idx_gallery_videos_created ON gallery_videos(created_at DESC);