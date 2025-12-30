// src/broll/scanqueue.ts
import { BrollFile } from './types';

// FORCE FIX: Tell TypeScript to ignore the missing process definition
declare const process: any;

// CONSTANTS
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_QUEUE_FOLDER_ID;
const ROOT_FOLDER_NAME = 'Processing Queue';

/**
 * Scans a specific Country folder within the Queue and returns a list of raw files.
 */
export async function scanCountryQueue(
  drive: any, 
  country: string, 
  maxFiles: number = 10
): Promise<BrollFile[]> {
  console.log(`[Queue Scanner] Starting scan for country: ${country}`);

  try {
    // 1. Determine the Queue Root ID
    let queueFolderId = ROOT_FOLDER_ID;

    // If no ID in secrets, try to find it by name
    if (!queueFolderId) {
        console.log(`[Queue Scanner] No GOOGLE_DRIVE_QUEUE_FOLDER_ID found. Searching by name: '${ROOT_FOLDER_NAME}'...`);
        queueFolderId = await getFolderId(drive, ROOT_FOLDER_NAME);
    }

    if (!queueFolderId) {
      throw new Error(`Critical: Queue folder (ID: ${process.env.GOOGLE_DRIVE_QUEUE_FOLDER_ID} or Name: '${ROOT_FOLDER_NAME}') not found.`);
    }

    // 2. Find the specific Country folder inside the queue
    // explicit cast to string to satisfy strict typescript checks
    const countryFolderId = await getFolderId(drive, country, queueFolderId as string);
    
    if (!countryFolderId) {
      console.warn(`[Queue Scanner] Country folder '${country}' does not exist inside queue ${queueFolderId}. Skipping.`);
      return [];
    }

    // 3. List files in the Country folder
    // We filter for video files that match our proxy naming convention (_low)
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
      isProxy: true
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