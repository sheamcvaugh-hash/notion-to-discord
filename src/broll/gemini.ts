// src/broll/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BrollFile } from './types';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || '');

/**
 * The main function that coordinates downloading from Drive and uploading to Gemini
 */
export async function analyzeVideo(drive: any, file: BrollFile): Promise<any> {
  const tempPath = path.join(os.tmpdir(), file.name);
  
  try {
    console.log(`[Gemini] 1. Downloading '${file.name}' locally...`);
    await downloadFromDrive(drive, file.id, tempPath);

    console.log(`[Gemini] 2. Uploading to Gemini workspace...`);
    const uploadResponse = await fileManager.uploadFile(tempPath, {
      mimeType: file.mimeType,
      displayName: file.name,
    });

    console.log(`[Gemini] 3. Waiting for video processing...`);
    let files = await fileManager.getFile(uploadResponse.file.name);
    
    // Loop until the video is active and ready for prompting
    while (files.state === FileState.PROCESSING) {
        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5s
        files = await fileManager.getFile(uploadResponse.file.name);
    }
    
    if (files.state === FileState.FAILED) {
        throw new Error("Gemini failed to process the video file.");
    }
    console.log("\n[Gemini] Video is ready! Generating analysis...");

    // 4. Run the Prompt
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri
        }
      },
      { text: "Analyze this video for stock footage usage. Give me a JSON object with: 1. A list of comma-separated tags describing the scene. 2. A one-sentence description. 3. The time of day (Day, Night, Golden Hour). 4. The dominant color palette." }
    ]);

    console.log(`[Gemini] Analysis complete.`);
    
    // Cleanup the Gemini server file to save space
    await fileManager.deleteFile(uploadResponse.file.name);
    
    return result.response.text();

  } catch (error) {
    console.error(`[Gemini] Error analyzing ${file.name}:`, error);
    throw error;
  } finally {
    // Always clean up the local temp file
    if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
    }
  }
}

/**
 * Helper: Streams file from Google Drive to local temp folder
 */
async function downloadFromDrive(drive: any, fileId: string, destPath: string): Promise<void> {
  const dest = fs.createWriteStream(destPath);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    res.data
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err))
      .pipe(dest);
  });
}