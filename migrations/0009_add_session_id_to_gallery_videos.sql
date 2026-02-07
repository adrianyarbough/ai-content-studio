-- Add session_id column to gallery_videos for bulk video generation
-- This allows grouping videos by bulk video sessions

-- Add session_id column if it doesn't exist
ALTER TABLE gallery_videos ADD COLUMN session_id TEXT;

-- Add image_id column to link back to source image
ALTER TABLE gallery_videos ADD COLUMN image_id INTEGER;

-- Add model column for video generation model tracking  
ALTER TABLE gallery_videos ADD COLUMN model TEXT;

-- Create indexes for fast session-based and image-based queries
CREATE INDEX IF NOT EXISTS idx_gallery_videos_session_id ON gallery_videos(session_id);
CREATE INDEX IF NOT EXISTS idx_gallery_videos_image_id ON gallery_videos(image_id);
CREATE INDEX IF NOT EXISTS idx_gallery_videos_model ON gallery_videos(model);