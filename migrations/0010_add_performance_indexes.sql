-- Add indexes for better query performance
-- This migration adds indexes on frequently queried columns

-- Indexes for gallery_images table
CREATE INDEX IF NOT EXISTS idx_gallery_images_session_id ON gallery_images(session_id);
CREATE INDEX IF NOT EXISTS idx_gallery_images_model ON gallery_images(model);
CREATE INDEX IF NOT EXISTS idx_gallery_images_created_at ON gallery_images(created_at DESC);

-- Indexes for gallery_videos table
CREATE INDEX IF NOT EXISTS idx_gallery_videos_session_id ON gallery_videos(session_id);
CREATE INDEX IF NOT EXISTS idx_gallery_videos_created_at ON gallery_videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_videos_gallery_image_id ON gallery_videos(gallery_image_id);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_gallery_images_session_model ON gallery_images(session_id, model);

