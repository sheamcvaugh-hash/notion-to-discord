// src/broll/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BrollFile, AnalysisResult, CanonicalType, validateGeminiOutput } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || '');

export async function analyzeVideo(drive: any, file: BrollFile): Promise<AnalysisResult> {
  const tempPath = path.join(os.tmpdir(), file.name);
  
  try {
    // 1. Download
    console.log(`[Gemini] 1. Downloading '${file.name}' locally...`);
    await downloadFromDrive(drive, file.id, tempPath);

    // 2. Upload to Gemini
    console.log(`[Gemini] 2. Uploading to Gemini workspace...`);
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

    // 5. Generate Content
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri
        }
      },
      { text: promptText }
    ]);

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