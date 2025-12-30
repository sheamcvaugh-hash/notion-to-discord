// src/broll/main.ts
import 'dotenv/config';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js'; 
import { scanProcessingQueue } from './scanqueue'; 
import { analyzeVideo } from './gemini';
import { organizeBrollFiles } from './organizeDrive'; // <--- NEW
import { finalizeDatabaseRecord } from './writeSupabase'; // <--- NEW
import { BrollFile, CanonicalType } from './types';
import * as fs from 'fs';
import * as path from 'path';

// CONFIGURATION
const SUPABASE_TABLE = 'broll_media_index';

async function main() {
  console.log('🚀 B-Roll Processor Starting...');

  try {
    // 1. AUTHENTICATION (Google)
    let auth;
    const keyFilePath = path.join(process.cwd(), 'service_account.json');

    if (fs.existsSync(keyFilePath)) {
      auth = new google.auth.GoogleAuth({ keyFile: keyFilePath, scopes: ['https://www.googleapis.com/auth/drive'] });
    } 
    else if (process.env.GOOGLE_CREDENTIALS_JSON) {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] });
    } else {
      throw new Error('MISSING AUTH: No service_account.json or GOOGLE_CREDENTIALS_JSON found.');
    }
    const drive = google.drive({ version: 'v3', auth });

    // 2. AUTHENTICATION (Supabase)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
    if (!supabaseUrl || !supabaseKey) throw new Error('MISSING SUPABASE KEYS in .env');
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. SCANNING FOR PROXIES
    const proxies = await scanProcessingQueue(drive);

    if (proxies.length === 0) {
      console.log('✅ No new files found to process.');
      return;
    }

    // 4. PROCESSING LOOP
    for (const proxyFile of proxies) {
      console.log(`\n🔍 Processing Proxy: ${proxyFile.name}...`);

      try {
        // --- STEP 0: CONTEXT & PAIRING ---
        // A. Get Parent Folder (This is the Country Source)
        const fileFields = await drive.files.get({
          fileId: proxyFile.id,
          fields: 'parents'
        });
        const parentId = fileFields.data.parents?.[0];
        if (!parentId) throw new Error('Proxy file has no parent folder.');

        const parentFolder = await drive.files.get({ fileId: parentId, fields: 'name' });
        const sourceCountry = parentFolder.data.name || 'Unknown';

        // B. Find Master File
        // Assumes Proxy is "Name_low.mov", Master is "Name.mov"
        const masterNameCandidate = proxyFile.name.replace('_low', '');
        
        const masterSearch = await drive.files.list({
          q: `'${parentId}' in parents and name = '${masterNameCandidate}' and trashed = false`,
          fields: 'files(id, name, mimeType)',
          pageSize: 1
        });

        const masterFileRaw = masterSearch.data.files?.[0];
        
        if (!masterFileRaw || !masterFileRaw.id || !masterFileRaw.name) {
          console.warn(`⚠ Skipping: Could not find master file '${masterNameCandidate}' for proxy.`);
          continue;
        }

        const masterFile: BrollFile = {
            id: masterFileRaw.id,
            name: masterFileRaw.name,
            mimeType: masterFileRaw.mimeType || 'video/quicktime',
            isProxy: false
        };

        // --- STEP 1: CHECK DB (Idempotency) ---
        // We check against the MASTER ID, not the proxy ID
        const { data: existing } = await supabase
          .from(SUPABASE_TABLE)
          .select('id')
          .eq('drive_id', masterFile.id)
          .maybeSingle();

        if (existing) {
          console.log(`⏩ Skipping (Master already in Database)`);
          continue;
        }

        // --- STEP 2: ANALYZE (GEMINI) ---
        console.log(`🎥 Sending Proxy to Gemini...`);
        // We pass the context (Country) to Gemini to help it
        // Note: passing sourceCountry as context requires updating analyzeVideo signature or just trusting the prompt injection
        // For now, we assume analyzeVideo handles the file content.
        
        const analysisRaw = await analyzeVideo(drive, proxyFile);
        
        // Clean up the JSON
        const jsonString = analysisRaw.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisData = JSON.parse(jsonString);

        // --- STEP 3: INSERT INITIAL RECORD ---
        // We insert the record NOW so we have the ID locked, even before moving
        console.log('🤖 Analysis done. Inserting initial record...');
        
        const { error: insertError } = await supabase
          .from(SUPABASE_TABLE)
          .insert({
            drive_id: masterFile.id, // CRITICAL: Use Master ID
            file_name: masterFile.name, // Temporary name
            mime_type: masterFile.mimeType,
            tags: analysisData.tags,          
            description: analysisData.summary, // Mapped from 'summary' in interface
            type: analysisData.type,
            processed_at: null // Null until finalized
          });

        if (insertError) throw insertError;

        // --- STEP 4: ORGANIZE DRIVE (MOVE & RENAME) ---
        const moveResult = await organizeBrollFiles(
          drive,
          masterFile,
          proxyFile,
          analysisData.suggested_filename,
          sourceCountry,     // Country (Source Folder)
          analysisData.city || 'Unknown', // City (From Gemini)
          analysisData.type  // Canonical Type
        );

        // --- STEP 5: FINALIZE DB RECORD ---
        await finalizeDatabaseRecord(
          supabase,
          moveResult.masterId,
          path.basename(moveResult.newPath), // New Filename
          moveResult.newPath,                // Full Path
          sourceCountry,
          analysisData.city || 'Unknown',
          analysisData.type
        );

        console.log('✅ Cycle Complete!');
        
      } catch (err) {
        console.error(`❌ Failed to process ${proxyFile.name}`, err);
      }
    }

  } catch (error) {
    console.error('🔥 Fatal Error:', error);
    process.exit(1); 
  }
}

main();