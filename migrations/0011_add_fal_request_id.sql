-- Add FAL request ID field for cancellation support
ALTER TABLE gallery_videos ADD COLUMN fal_request_id TEXT;
