// src/broll/scanqueue.ts
import { BrollFile } from './types';

// FORCE FIX: Tell TypeScript to ignore the missing process definition
declare const process: any;

// CONSTANTS
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_QUEUE_FOLDER_ID;
const ROOT_FOLDER_NAME = 'Processing Queue';

/**
 * Scans ALL folders inside the "Processing Queue" root
 * and returns a flattened list of all proxy files found.
 */
export async function scanProcessingQueue(drive: any, maxFilesPerFolder: number = 5): Promise<BrollFile[]> {
  console.log(`[Queue Scanner] Starting global scan of Processing Queue...`);
  let allFiles: BrollFile[] = [];

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

    // 2. Find ALL sub-folders inside the root
    const folderRes = await drive.files.list({
      q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 50, 
    });

    const subFolders = folderRes.data.files || [];
    console.log(`[Queue Scanner] Found ${subFolders.length} folders to check: ${subFolders.map((f:any) => f.name).join(', ')}`);

    // 3. Loop through each folder and find files
    for (const folder of subFolders) {
      console.log(`   📂 Checking folder: ${folder.name}...`);
      
      const fileRes = await drive.files.list({
        q: `'${folder.id}' in parents and name contains '_low' and mimeType contains 'video/' and trashed = false`,
        fields: 'files(id, name, mimeType)',
        pageSize: maxFilesPerFolder,
      });

      const found = fileRes.data.files || [];
      if (found.length > 0) {
        console.log(`      Found ${found.length} files.`);
        const mapped = found.map((f: any): BrollFile => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          isProxy: true
        }));
        allFiles = [...allFiles, ...mapped];
      }
    }

    return allFiles;

  } catch (error) {
    console.error(`[Queue Scanner] Error scanning queue:`, error);
    throw error;
  }
}

/**
 * Helper: Find a folder ID by name
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