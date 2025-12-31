// src/broll/types.ts

// 1. Canonical Type Classification List
// Gemini MUST return one of these exact string values.
export enum CanonicalType {
  Food = 'Food',
  City = 'City',
  People = 'People',
  Gear = 'Gear',
  Animals = 'Animals',
  Place = 'Place',
  Transit = 'Transit',
  Nature = 'Nature',
  ActionActivity = 'Action/Activity' 
}

// Represents a raw file found in Google Drive
export interface BrollFile {
  id: string;
  name: string;
  mimeType: string;
  isProxy: boolean; 
}

// The Strict JSON output expected from Gemini
export interface AnalysisResult {
  suggested_filename: string;
  tags: string[];
  type: CanonicalType;
  summary: string;
}

/**
 * STRICT VALIDATOR
 * Enforces:
 * - Exact object keys (no extras)
 * - Exact value types
 * - Tag count (3-5) and formatting
 * - Filename constraints
 */
export function validateGeminiOutput(data: any): AnalysisResult {
  // 1. Strict Object Shape Check (No extra keys allowed)
  const allowedKeys = ['suggested_filename', 'tags', 'type', 'summary'];
  const dataKeys = Object.keys(data);
  
  if (dataKeys.length !== 4) {
    throw new Error(`Validation Failed: Object has ${dataKeys.length} keys, expected exactly 4.`);
  }

  for (const key of dataKeys) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Validation Failed: Forbidden key '${key}' detected.`);
    }
  }

  // 2. Type Check
  const validTypes = Object.values(CanonicalType);
  if (!validTypes.includes(data.type)) {
    throw new Error(`Validation Failed: Invalid type '${data.type}'. Allowed: ${validTypes.join(', ')}`);
  }

  // 3. Summary Check
  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    throw new Error("Validation Failed: Summary must be a non-empty string.");
  }

  // 4. Filename Check
  if (typeof data.suggested_filename !== 'string' || !data.suggested_filename.trim()) {
    throw new Error("Validation Failed: suggested_filename must be a non-empty string.");
  }
  
  const badFilenameChars = /[#,[\]\\/]/; // No hashtags, commas, brackets, slashes
  if (badFilenameChars.test(data.suggested_filename)) {
    throw new Error(`Validation Failed: suggested_filename contains forbidden characters (#, comma, brackets, slashes). Got: ${data.suggested_filename}`);
  }

  // 5. Tags Check
  if (!Array.isArray(data.tags)) {
    throw new Error("Validation Failed: tags must be an array.");
  }

  // Normalize tags: trim, collapse spaces, remove empty
  const normalizedTags = data.tags
    .map((t: any) => String(t).trim().replace(/\s+/g, ' '))
    .filter((t: string) => t.length > 0);

  // Logic: < 3 is failure
  if (normalizedTags.length < 3) {
    throw new Error(`Validation Failed: Too few tags (${normalizedTags.length}). Minimum 3 required.`);
  }

  // Logic: > 5 is trimmed deterministically
  const finalTags = normalizedTags.slice(0, 5);

  return {
    suggested_filename: data.suggested_filename.trim(),
    tags: finalTags,
    type: data.type as CanonicalType,
    summary: data.summary.trim()
  };
}