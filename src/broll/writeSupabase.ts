// src/broll/writeSupabase.ts
import { SupabaseClient } from '@supabase/supabase-js';

export async function finalizeDatabaseRecord(
  supabase: SupabaseClient,
  masterFileId: string,
  finalFileName: string,
  canonicalPath: string,
  country: string,
  city: string,
  type: string
) {
  console.log(`\n💾 Finalizing Database Record for ${masterFileId}...`);

  const { error } = await supabase
    .from('broll_media_index')
    .update({
      file_name: finalFileName,
      canonical_path: canonicalPath,
      country: country,
      city: city,
      type: type,
      processed_at: new Date().toISOString()
    })
    .eq('drive_id', masterFileId); // Primary Key Match

  if (error) {
    console.error(`❌ DB Write Failed:`, error);
    throw new Error(`Supabase Update Failed: ${error.message}`);
  }

  console.log(`   ✔ Record updated successfully.`);
}