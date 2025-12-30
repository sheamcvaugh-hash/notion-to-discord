// src/broll/main.ts
import 'dotenv/config';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js'; 
import { scanCountryQueue } from './scanqueue'; 
import { analyzeVideo } from './gemini';
import * as fs from 'fs';
import * as path from 'path';

// CONFIGURATION
const TARGET_COUNTRY = 'Japan'; 
const SUPABASE_TABLE = 'broll_media_index';

async function main() {
  console.log('🚀 B-Roll Processor Starting...');

  try {
    // 1. AUTHENTICATION (Google)
    let auth;
    const keyFilePath = path.join(process.cwd(), 'service_account.json');

    if (fs.existsSync(keyFilePath)) {
      console.log('🔑 Auth: Found local service_account.json');
      auth = new google.auth.GoogleAuth({ keyFile: keyFilePath, scopes: ['https://www.googleapis.com/auth/drive'] });
    } 
    // FIXED: Using the correct secret name from your Fly list
    else if (process.env.GOOGLE_CREDENTIALS_JSON) {
      console.log('🔑 Auth: Using GOOGLE_CREDENTIALS_JSON from environment');
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

    // 3. SCANNING
    console.log(`\n📂 Scanning for files in: ${TARGET_COUNTRY}...`);
    const filesToProcess = await scanCountryQueue(drive, TARGET_COUNTRY);

    if (filesToProcess.length === 0) {
      console.log('✅ No new files found to process.');
      return;
    }

    // 4. PROCESSING LOOP
    for (const file of filesToProcess) {
      console.log(`\n🎥 Processing: ${file.name} (${file.id})`);
      
      try {
        // A. Analyze with Gemini
        const analysisRaw = await analyzeVideo(drive, file);
        
        // Clean up the JSON (Gemini sometimes adds markdown ```json blocks)
        const jsonString = analysisRaw.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisData = JSON.parse(jsonString);

        console.log('🤖 Saving to Supabase:', analysisData.description);

        // B. Save to Supabase
        const { error } = await supabase
          .from(SUPABASE_TABLE)
          .insert({
            drive_id: file.id,
            file_name: file.name,
            mime_type: file.mimeType,
            tags: analysisData.tags,          
            description: analysisData.description, 
            time_of_day: analysisData.time_of_day, 
            color_palette: analysisData.color_palette, 
            processed_at: new Date().toISOString()
          });

        if (error) throw error;
        console.log('✅ Saved successfully!');

        // Optional: Move file in Drive to a "Processed" folder could happen here
        
      } catch (err) {
        console.error(`❌ Failed to process ${file.name}`, err);
      }
    }

  } catch (error) {
    console.error('🔥 Fatal Error:', error);
    process.exit(1); 
  }
}

main();