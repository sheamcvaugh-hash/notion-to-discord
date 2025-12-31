-- Single authoritative table for B-roll indexing
-- Phase 3 Cleanup: Canonical Schema (Strict)
-- Definition of Done: Matches docs/DB_SCHEMA.md exactly.

CREATE TABLE IF NOT EXISTS broll_media_index (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Geographic Context (Source of Truth)
  country TEXT NOT NULL CHECK (country <> ''),
  city TEXT NOT NULL CHECK (city <> ''),
  
  -- Content Classification
  -- Must match CanonicalType enum exactly
  type TEXT NOT NULL CHECK (
    type IN (
      'Food', 
      'City', 
      'People', 
      'Gear', 
      'Animals', 
      'Place', 
      'Transit', 
      'Nature', 
      'Action/Activity'
    )
  ),
  
  -- Metadata (Strict)
  tags TEXT[] NOT NULL,
  summary TEXT NOT NULL,
  
  -- File Tracking
  file_name TEXT NOT NULL,
  drive_file_id TEXT NOT NULL UNIQUE,
  drive_library_path TEXT NOT NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_broll_drive_id ON broll_media_index(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_broll_location ON broll_media_index(country, city);
CREATE INDEX IF NOT EXISTS idx_broll_type ON broll_media_index(type);