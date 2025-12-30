// src/broll/organizeDrive.ts
import { google } from 'googleapis';
import { BrollFile, CanonicalType } from './types';

// Initialize Drive API type for TS
type DriveClient = ReturnType<typeof google.drive>;

interface MoveResult {
  success: boolean;
  newPath: string;
  masterId: string;
}

export async function organizeBrollFiles(
  drive: DriveClient,
  masterFile: BrollFile,
  proxyFile: BrollFile,
  suggestedName: string,
  country: string,
  city: string,
  type: CanonicalType
): Promise<MoveResult> {
  const LIBRARY_ROOT_ID = process.env.GOOGLE_DRIVE_LIBRARY_FOLDER_ID;
  if (!LIBRARY_ROOT_ID) throw new Error('FATAL: GOOGLE_DRIVE_LIBRARY_FOLDER_ID is not set.');

  console.log(`\n📦 Organization Module Started`);
  console.log(`   Target: ${country}/${city}/${type}/${suggestedName}`);

  try {
    // 1. RESOLVE FOLDER STRUCTURE
    // Level 1: Country (MUST exist per constraints)
    const countryId = await findFolder(drive, LIBRARY_ROOT_ID, country);
    if (!countryId) {
      throw new Error(`Constraint Violation: Country folder '${country}' does not exist in B-Roll Library.`);
    }

    // Level 2: City (Create if missing)
    let cityId = await findFolder(drive, countryId, city);
    if (!cityId) {
      console.log(`   + Creating City folder: ${city}`);
      cityId = await createFolder(drive, countryId, city);
    }

    // Level 3: Type (Create if missing)
    let typeId = await findFolder(drive, cityId, type);
    if (!typeId) {
      console.log(`   + Creating Type folder: ${type}`);
      typeId = await createFolder(drive, cityId, type);
    }

    // 2. RENAME MASTER
    // We strictly use the suggested name + original extension (assuming .mov based on context, or preserving original)
    // Extract extension from original master name
    const ext = masterFile.name.split('.').pop(); 
    const finalName = `${suggestedName}.${ext}`;

    await drive.files.update({
      fileId: masterFile.id,
      requestBody: { name: finalName },
    });
    console.log(`   ✔ Renamed Master to: ${finalName}`);

    // 3. MOVE MASTER
    // We must retrieve the current parent to remove it (Drive API requires removing old parent)
    const fileData = await drive.files.get({ fileId: masterFile.id, fields: 'parents' });
    const previousParents = fileData.data.parents?.join(',') || '';

    await drive.files.update({
      fileId: masterFile.id,
      addParents: typeId,
      removeParents: previousParents,
      fields: 'id, parents',
    });
    console.log(`   ✔ Moved Master to: .../${city}/${type}/`);

    // 4. VERIFY MOVE (Safety Check)
    const verification = await drive.files.get({
      fileId: masterFile.id,
      fields: 'parents',
    });
    
    const isSafe = verification.data.parents?.includes(typeId);
    
    if (!isSafe) {
      throw new Error(`CRITICAL: Verification failed. Master file ${masterFile.id} is not in target folder ${typeId}. Aborting proxy deletion.`);
    }

    // 5. DELETE PROXY
    // Only happens if step 4 passes
    await drive.files.update({
      fileId: proxyFile.id,
      requestBody: { trashed: true },
    });
    console.log(`   🗑 Proxy file trashed (Safety check passed).`);

    return {
      success: true,
      newPath: `B-Roll Library/${country}/${city}/${type}/${finalName}`,
      masterId: masterFile.id
    };

  } catch (error) {
    console.error(`❌ Organization Failed:`, error);
    throw error; // Propagate up to stop DB writes
  }
}

// --- HELPER FUNCTIONS ---

async function findFolder(drive: DriveClient, parentId: string, name: string): Promise<string | null> {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });
  return res.data.files?.[0]?.id || null;
}

async function createFolder(drive: DriveClient, parentId: string, name: string): Promise<string> {
  const res = await drive.files.create({
    requestBody: {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  if (!res.data.id) throw new Error(`Failed to create folder ${name}`);
  return res.data.id;
}