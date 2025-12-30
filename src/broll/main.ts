// src/broll/main.ts
import 'dotenv/config'; // <--- This loads your API keys
import { google } from 'googleapis';
import { scanCountryQueue } from './scanqueue'; // <--- Fixed the capitalization here
import { analyzeVideo } from './gemini';
import * as fs from 'fs';
import * as path from 'path';

// CONFIGURATION
// You can change this to whatever folder you want to scan first
const TARGET_COUNTRY = 'Japan'; 

async function main() {
  console.log('🚀 B-Roll Processor Starting...');

  try {
    // 1. AUTHENTICATION
    // We look for a file named "service_account.json" in the root folder
    const keyFilePath = path.join(process.cwd(), 'service_account.json');
    
    if (!fs.existsSync(keyFilePath)) {
      throw new Error('MISSING AUTH: Please put your Google "service_account.json" file in the main folder!');
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // 2. SCANNING
    console.log(`\n📂 Scanning for files in: ${TARGET_COUNTRY}...`);
    const filesToProcess = await scanCountryQueue(drive, TARGET_COUNTRY);

    if (filesToProcess.length === 0) {
      console.log('✅ No new files found to process.');
      return;
    }

    // 3. PROCESSING LOOP
    for (const file of filesToProcess) {
      console.log(`\n🎥 Processing: ${file.name} (${file.id})`);
      
      try {
        // Send to Gemini
        const analysisJson = await analyzeVideo(drive, file);
        
        console.log('------------------------------------------------');
        console.log('🤖 GEMINI RESULTS:');
        console.log(analysisJson);
        console.log('------------------------------------------------');

        // TODO: Next step will be saving this to Supabase
        
      } catch (err) {
        console.error(`❌ Failed to process ${file.name}`, err);
      }
    }

  } catch (error) {
    console.error('🔥 Fatal Error:', error);
  }
}

// Run the main function
main();