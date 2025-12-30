-- Single authoritative table for B-roll indexing
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS broll_media_index (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  drive_file_id TEXT NOT NULL UNIQUE,
  drive_path TEXT NOT NULL,
  country TEXT,
  city TEXT,
  category TEXT[] DEFAULT '{}',
  media_timestamp TIMESTAMPTZ,
  ai_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: Indexes for performance
CREATE INDEX IF NOT EXISTS idx_broll_filename ON broll_media_index(filename);
CREATE INDEX IF NOT EXISTS idx_broll_drive_id ON broll_media_index(drive_file_id);