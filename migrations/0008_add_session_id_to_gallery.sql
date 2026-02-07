-- Add session_id column to gallery_images for Gallery Sessions feature
-- This links images to bulk deployment sessions for filtering and bulk video generation

-- Add session_id column if it doesn't exist
ALTER TABLE gallery_images ADD COLUMN session_id TEXT;

-- Create index for fast session-based queries
CREATE INDEX IF NOT EXISTS idx_gallery_images_session_id ON gallery_images(session_id);

-- Update existing records to extract session_id from batch_id if possible
-- batch_id format is like: bulk-deploy-{sessionId}-{themeId}
-- We want to extract the sessionId part
UPDATE gallery_images 
SET session_id = CASE 
  WHEN batch_id LIKE 'bulk-deploy-%' THEN 
    SUBSTR(batch_id, 13, INSTR(SUBSTR(batch_id, 13), '-') - 1)
  ELSE 
    batch_id 
END
WHERE session_id IS NULL;