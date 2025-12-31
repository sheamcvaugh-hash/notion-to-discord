// src/broll/main.ts
import 'dotenv/config';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js'; 
import { scanProcessingQueue } from './scanQueue';
import { analyzeVideo } from './gemini';
import { organizeBrollFiles, moveProxyToOutbox } from './organizeDrive';
import { writeCanonicalRecord } from './writeSupabase';
import { BrollFile } from './types';
import * as fs from 'fs';
import * as path from 'path';

// CONFIGURATION
const SUPABASE_TABLE = 'broll_media_index';

// HELPER: FORCE TITLE CASE
// Ensures "mexico" -> "Mexico"
function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// CLI ARGUMENT PARSING (Normalized immediately)
const TARGET_COUNTRY = toTitleCase(process.argv[2]);
const TARGET_CITY = toTitleCase(process.argv[3]);

async function main() {
  console.log('🚀 B-Roll Processor Starting...');

  // 0. FAIL FAST: ARGUMENT REQUIREMENTS
  if (!TARGET_COUNTRY || TARGET_COUNTRY.trim() === '') {
    console.error('🔥 FATAL: No Country provided.');
    process.exit(1);
  }
  if (!TARGET_CITY || TARGET_CITY.trim() === '') {
    console.error('🔥 FATAL: No City provided.');
    process.exit(1);
  }

  console.log(`📍 Context: Country = ${TARGET_COUNTRY}, City = ${TARGET_CITY}`);

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
    const proxies = await scanProcessingQueue(drive, TARGET_COUNTRY as string);

    if (proxies.length === 0) {
      console.log('✅ No new files found to process.');
      return;
    }

    // 4. PROCESSING LOOP
    for (const proxyFile of proxies) {
      console.log(`\n---------------------------------------------------`);
      console.log(`🔍 Processing Proxy: ${proxyFile.name}...`);

      try {
        const sourceCountry = TARGET_COUNTRY as string;

        // Step 1: Find Parent
        const fileFields = await drive.files.get({
          fileId: proxyFile.id,
          fields: 'parents'
        });
        const parentId = fileFields.data.parents?.[0];
        if (!parentId) throw new Error('Proxy file has no parent folder.');

        // Step 2: Find Master
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

        // Step 3: Idempotency
        const { data: existing } = await supabase
          .from(SUPABASE_TABLE)
          .select('id')
          .eq('drive_file_id', masterFile.id)
          .maybeSingle();

        if (existing) {
          console.log(`⏩ Skipping: Master file ${masterFile.name} is already in the database.`);
          continue;
        }

        // Step 4: Analyze
        console.log(`🎥 Sending Proxy to Gemini...`);
        const analysis = await analyzeVideo(drive, proxyFile);

        console.log(`   + Validated Type: ${analysis.type}`);
        console.log(`   + Validated Filename: ${analysis.suggested_filename}`);

        // Step 5: Organize Master (Renames and Moves Master)
        // Note: Proxy is NOT touched here anymore to ensure atomicity
        const moveResult = await organizeBrollFiles(
          drive,
          masterFile,
          analysis.suggested_filename,
          sourceCountry,
          TARGET_CITY,   
          analysis.type
        );

        if (!moveResult.success) {
            throw new Error("Drive Organization failed silently.");
        }

        // Step 6: Write DB
        await writeCanonicalRecord(supabase, {
            file_name: path.basename(moveResult.newPath),
            drive_file_id: masterFile.id,
            drive_library_path: moveResult.newPath,
            country: sourceCountry,
            city: TARGET_CITY,
            type: analysis.type,
            tags: analysis.tags,
            summary: analysis.summary
        });

        // Step 7: Move Proxy to Outbox (Atomic requirement: Only after DB write)
        await moveProxyToOutbox(drive, proxyFile.id);

        console.log('✅ Cycle Complete for this clip!');
        
      } catch (err: any) {
        console.error(`❌ FAILED ${proxyFile.name}: ${err.message}`);
      }
    }

  } catch (error) {
    console.error('🔥 Fatal Process Error:', error);
    process.exit(1); 
  }
}

main().catch(err => console.error("Unhandled Top-Level Error:", err));