-- Bulk Theme System Database Schema
-- Adds tables for bulk theme upload and deployment functionality

-- Store bulk theme profiles uploaded by users
CREATE TABLE IF NOT EXISTS bulk_theme_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  theme TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('S-TIER', 'A-TIER', 'B-TIER', 'C-TIER')),
  tags TEXT NOT NULL, -- JSON string of tags array
  model TEXT NOT NULL,
  master_prompt TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure no duplicate Category + Theme combinations
  UNIQUE(category, theme)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_bulk_theme_profiles_category ON bulk_theme_profiles(category);
CREATE INDEX IF NOT EXISTS idx_bulk_theme_profiles_tier ON bulk_theme_profiles(tier);
CREATE INDEX IF NOT EXISTS idx_bulk_theme_profiles_model ON bulk_theme_profiles(model);
CREATE INDEX IF NOT EXISTS idx_bulk_theme_profiles_created_at ON bulk_theme_profiles(created_at);

-- Add trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_bulk_theme_profiles_updated_at
    AFTER UPDATE ON bulk_theme_profiles
BEGIN
    UPDATE bulk_theme_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Note: gallery_images table already exists from previous migrations
-- It will be reused to store generated images with metadata linking to theme profiles
-- The existing schema supports:
-- - theme_id (can link to bulk_theme_profiles.id) 
-- - theme_name (will store the theme name from bulk profiles)
-- - model (already supports model information)
-- - prompt (stores the generated variation prompt)
-- - image_url (stores the generated image URL)
-- - tags (JSON array for additional metadata)
-- - created_at (timestamp)

-- Add a column to gallery_images to link back to bulk theme profiles (if not exists)
-- This allows tracking which bulk profile generated which images
ALTER TABLE gallery_images ADD COLUMN bulk_theme_profile_id INTEGER REFERENCES bulk_theme_profiles(id);

-- Create index for the new foreign key
CREATE INDEX IF NOT EXISTS idx_gallery_images_bulk_theme_profile_id ON gallery_images(bulk_theme_profile_id);