// src/broll/scanqueue.ts
import { BrollFile } from './types';

// FORCE FIX: Tell TypeScript to ignore the missing process definition
declare const process: any;

// CONSTANTS
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_QUEUE_FOLDER_ID;
const ROOT_FOLDER_NAME = 'Processing Queue';

/**
 * Scans EXACTLY one country folder inside the "Processing Queue" root.
 * Returns only proxy files (*_low.*).
 * Throws an error if the country folder does not exist.
 */
export async function scanProcessingQueue(drive: any, country: string): Promise<BrollFile[]> {
  console.log(`[Queue Scanner] Starting scoped scan for Country: ${country}`);

  try {
    // 1. Determine the Queue Root ID
    let rootId = ROOT_FOLDER_ID;
    if (!rootId) {
        console.log(`[Queue Scanner] No ID found in secrets. Searching by name: '${ROOT_FOLDER_NAME}'...`);
        rootId = await getFolderId(drive, ROOT_FOLDER_NAME);
    }

    if (!rootId) {
      throw new Error(`Critical: Queue root folder not found.`);
    }

    // 2. Resolve the Specific Country Folder
    // We do NOT list all folders. We look for exactly one.
    const countryFolderRes = await drive.files.list({
      q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${country}' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1, 
    });

    const countryFolder = countryFolderRes.data.files?.[0];

    if (!countryFolder) {
      // FAIL FAST: If the folder for the requested country doesn't exist, we stop.
      throw new Error(`Queue folder for country '${country}' does not exist.`);
    }

    console.log(`   📂 Accessing folder: ${countryFolder.name} (${countryFolder.id})`);

    // 3. List ONLY proxy files in that folder
    const fileRes = await drive.files.list({
      q: `'${countryFolder.id}' in parents and name contains '_low' and mimeType contains 'video/' and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100, // Reasonable batch size
    });

    const found = fileRes.data.files || [];
    
    if (found.length === 0) {
        console.log(`      No proxy files found in ${country}.`);
        return [];
    }

    console.log(`      Found ${found.length} proxy files.`);
    
    const mapped: BrollFile[] = found.map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isProxy: true
    }));

    return mapped;

  } catch (error) {
    console.error(`[Queue Scanner] Error scanning queue:`, error);
    throw error;
  }
}

/**
 * Helper: Find a folder ID by name (Used only for Root fallback)
 */
async function getFolderId(drive: any, name: string): Promise<string | null> {
  const res = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  const folder = res.data.files?.[0];
  return folder ? folder.id : null;
}