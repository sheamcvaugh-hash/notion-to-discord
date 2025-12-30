// src/broll/scanQueue.ts
import { BrollFile } from './types';

// CONSTANTS
const ROOT_FOLDER_NAME = 'Processing Queue';

/**
 * Scans a specific Country folder within the "Processing Queue"
 * and returns a list of raw files found.
 * * NOTE: We use 'any' for the drive client to bypass strict TypeScript version conflicts.
 */
export async function scanCountryQueue(
  drive: any, 
  country: string, 
  maxFiles: number = 10
): Promise<BrollFile[]> {
  console.log(`[Queue Scanner] Starting scan for country: ${country}`);

  try {
    // 1. Find the "Processing Queue" root folder
    const queueFolderId = await getFolderId(drive, ROOT_FOLDER_NAME);
    if (!queueFolderId) {
      throw new Error(`Critical: Root folder '${ROOT_FOLDER_NAME}' not found.`);
    }

    // 2. Find the specific Country folder inside the queue
    const countryFolderId = await getFolderId(drive, country, queueFolderId);
    if (!countryFolderId) {
      console.warn(`[Queue Scanner] Country folder '${country}' does not exist in queue. Skipping.`);
      return [];
    }

    // 3. List files in the Country folder
    // We filter for video files that match our proxy naming convention (_low)
    // Note: 'trashed = false' is critical to avoid deleted files
    const res = await drive.files.list({
      q: `'${countryFolderId}' in parents and name contains '_low' and mimeType contains 'video/' and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: maxFiles,
    });

    const files = res.data.files || [];
    console.log(`[Queue Scanner] Found ${files.length} potential proxy files for ${country}.`);

    // 4. Map to our BrollFile interface
    return files.map((f: any): BrollFile => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isProxy: true // By definition of our search query above
    }));

  } catch (error) {
    console.error(`[Queue Scanner] Error scanning queue for ${country}:`, error);
    throw error;
  }
}

/**
 * Helper: Find a folder ID by name, optionally inside a parent folder.
 */
async function getFolderId(drive: any, name: string, parentId?: string): Promise<string | null> {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  const folder = res.data.files?.[0];
  return folder ? folder.id : null;
}