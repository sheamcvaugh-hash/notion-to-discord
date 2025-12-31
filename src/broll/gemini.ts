// src/broll/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BrollFile, AnalysisResult, CanonicalType, validateGeminiOutput } from './types';

// UPDATED: Prioritize the specific B-Roll Agent Key, fallback to generic if missing
const API_KEY = process.env.GEMINI_BROLL_AGENT || process.env.GEMINI_API_KEY || '';

const genAI = new GoogleGenerativeAI(API_KEY);
const fileManager = new GoogleAIFileManager(API_KEY);

// ROBUST MODEL LIST: We try these in order until one works.
// This handles deprecations (e.g. 001 retiring) automatically.
const MODELS_TO_TRY = [
    "gemini-1.5-flash-002",  // Latest Stable Flash
    "gemini-1.5-pro-002",    // Latest Stable Pro (Backup)
    "gemini-1.5-flash",      // Generic Alias (Backup 2)
    "gemini-2.0-flash-exp"   // Experimental (Last Resort)
];

export async function analyzeVideo(drive: any, file: BrollFile): Promise<AnalysisResult> {
  const tempPath = path.join(os.tmpdir(), file.name);
  
  // Fail fast if auth is missing
  if (!API_KEY) {
      throw new Error("MISSING AUTH: GEMINI_BROLL_AGENT is not set.");
  }

  try {
    // 1. Download
    console.log(`[Gemini] 1. Downloading '${file.name}' locally...`);
    await downloadFromDrive(drive, file.id, tempPath);

    // Verify file size before uploading
    const stats = fs.statSync(tempPath);
    if (stats.size === 0) {
        throw new Error("Downloaded file is empty (0 bytes).");
    }

    // 2. Upload to Gemini
    console.log(`[Gemini] 2. Uploading to Gemini workspace (${stats.size} bytes)...`);
    const uploadResponse = await fileManager.uploadFile(tempPath, {
      mimeType: file.mimeType,
      displayName: file.name,
    });

    // 3. Wait for Processing
    console.log(`[Gemini] 3. Waiting for video processing...`);
    let files = await fileManager.getFile(uploadResponse.file.name);
    
    while (files.state === FileState.PROCESSING) {
        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, 5000));
        files = await fileManager.getFile(uploadResponse.file.name);
    }
    
    if (files.state === FileState.FAILED) {
        throw new Error("Gemini failed to process the video file internally.");
    }
    console.log("\n[Gemini] Video is ready! Generating strict analysis...");

    // 4. Construct Strict Prompt
    const validTypes = Object.values(CanonicalType).join(', ');
    const promptText = `
      Analyze this video for stock footage usage.
      You must return ONLY a raw JSON object (no markdown, no backticks).
      
      Strict Object Shape (exactly these 4 keys, NO others):
      {
        "suggested_filename": "string",
        "tags": ["string", "string", "string"],
        "type": "string",
        "summary": "string"
      }

      REQUIRED FIELDS:
      1. "suggested_filename": string (kebab-case, human-readable). NO hashtags. NO brackets. NO slashes.
      2. "tags": array of strings (Length 3-5).
      3. "type": string (Must be exactly one of: ${validTypes}).
      4. "summary": string (One-sentence description).

      TYPE PRIORITY RULES (Tie-breakers):
      - Action/Activity overrides everything
      - People overrides Place and City
      - Place = interior context
      - City = exterior built environment
      - Transit = transport-focused
      - Nature only when human structures are not dominant
      - Gear only when the object is the point (not incidental)
      - Animals always win
      - Tie-breaker: "What would I search for this clip to reuse it?"

      FORBIDDEN FIELDS (Do NOT output these):
      - country
      - city
      - timestamps / time-of-day
      - mime types / camera info

      If you cannot comply with strict JSON or these rules, output exactly: INVALID_OUTPUT
    `;

    // 5. Generate Content with Fallback Loop
    let lastError;
    let result = null;

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log(`[Gemini]    Trying model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            
            result = await model.generateContent([
              {
                fileData: {
                  mimeType: uploadResponse.file.mimeType,
                  fileUri: uploadResponse.file.uri
                }
              },
              { text: promptText }
            ]);
            
            // If we get here, it worked! Break the loop.
            console.log(`[Gemini]    Success with ${modelName}!`);
            break; 

        } catch (err: any) {
            console.warn(`[Gemini]    Failed on ${modelName} (${err.status || err.message}). Switching...`);
            lastError = err;
            // Continue to next model
        }
    }

    if (!result) {
        throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
    }

    const rawText = result.response.text().trim();

    // 6. Parse and Validate (Fail-Fast)
    if (rawText === 'INVALID_OUTPUT') {
      throw new Error("Gemini signaled INVALID_OUTPUT.");
    }

    const cleanedJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    let data: any;
    
    try {
      data = JSON.parse(cleanedJson);
    } catch (e) {
      throw new Error(`Gemini returned invalid JSON: ${rawText.substring(0, 50)}...`);
    }

    // Call Strict Validator (Throws if invalid)
    const validatedResult = validateGeminiOutput(data);

    // 7. Cleanup Gemini File
    await fileManager.deleteFile(uploadResponse.file.name);
    
    return validatedResult;

  } catch (error) {
    console.error(`[Gemini] Error analyzing ${file.name}:`, error);
    throw error;
  } finally {
    if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
    }
  }
}

// FIXED: Robust download function that waits for disk write to complete
async function downloadFromDrive(drive: any, fileId: string, destPath: string): Promise<void> {
  const dest = fs.createWriteStream(destPath);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    res.data
      .on('error', (err: any) => reject(err))
      .pipe(dest)
      .on('error', (err: any) => reject(err))
      .on('finish', () => resolve()); // Waits for file to close properly
  });
}