// src/broll/writeSupabase.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { CanonicalType } from './types';

interface CanonicalRecord {
  file_name: string;
  drive_file_id: string;
  drive_library_path: string;
  country: string;
  city: string;
  type: CanonicalType;
  tags: string[];
  summary: string;
}

/**
 * Writes the final immutable record to Supabase.
 * Per Phase 3 lifecycle: This happens AFTER move/rename and BEFORE proxy deletion.
 */
export async function writeCanonicalRecord(
  supabase: SupabaseClient,
  record: CanonicalRecord
) {
  console.log(`\n💾 Writing Database Record for ${record.file_name}...`);

  const { error } = await supabase
    .from('broll_media_index')
    .insert({
      file_name: record.file_name,
      drive_file_id: record.drive_file_id,
      drive_library_path: record.drive_library_path,
      country: record.country,
      city: record.city,
      type: record.type,
      tags: record.tags,
      summary: record.summary,
      // created_at / updated_at handled by DB defaults
    });

  if (error) {
    console.error(`❌ DB Write Failed:`, error);
    throw new Error(`Supabase Insert Failed: ${error.message}`);
  }

  console.log(`   ✔ Record inserted successfully.`);
}