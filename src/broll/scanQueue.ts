// src/broll/scanQueue.ts
import { BrollFile } from './types';

declare const process: any;

const ROOT_FOLDER_NAME = 'Processing Queue';

export async function scanProcessingQueue(drive: any, country: string): Promise<BrollFile[]> {
  console.log(`[Queue Scanner] Starting scoped scan for Country: ${country}`);

  try {
    const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_QUEUE_FOLDER_ID;

    // 1. Determine the Queue Root ID
    let rootId = ROOT_FOLDER_ID;
    if (!rootId) {
        console.log(`[Queue Scanner] No ID found in secrets. Searching by name: '${ROOT_FOLDER_NAME}'...`);
        rootId = await getFolderId(drive, ROOT_FOLDER_NAME);
    }

    if (!rootId) {
      throw new Error(`Critical: Queue root folder not found.`);
    }

    // --- DEBUG LOG START ---
    console.log(`[DEBUG] Scanning inside Folder ID: ${rootId}`);
    // --- DEBUG LOG END ---

    // 2. Resolve the Specific Country Folder (CASE INSENSITIVE)
    const allFoldersRes = await drive.files.list({
      q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100, 
    });

    const allFolders = allFoldersRes.data.files || [];
    
    // Find matching folder (ignoring case)
    const countryFolder = allFolders.find((f: any) => f.name.toLowerCase() === country.toLowerCase());

    if (!countryFolder) {
      // List what we DID see to help debug
      const seenNames = allFolders.map((f: any) => f.name).join(', ');
      throw new Error(`Queue folder for country '${country}' does not exist. (I saw these folders: [${seenNames}])`);
    }

    console.log(`   📂 Accessing folder: ${countryFolder.name} (${countryFolder.id})`);

    // 3. List ONLY proxy files
    const fileRes = await drive.files.list({
      q: `'${countryFolder.id}' in parents and name contains '_low' and mimeType contains 'video/' and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100,
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

async function getFolderId(drive: any, name: string): Promise<string | null> {
  const res = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  const folder = res.data.files?.[0];
  return folder ? folder.id : null;
}