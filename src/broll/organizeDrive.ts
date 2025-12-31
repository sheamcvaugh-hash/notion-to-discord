// src/broll/organizeDrive.ts
import { google } from 'googleapis';
import { BrollFile, CanonicalType } from './types';

// Initialize Drive API type for TS
type DriveClient = ReturnType<typeof google.drive>;

interface MoveResult {
  success: boolean;
  newPath: string; // Used for drive_library_path
  masterId: string;
}

/**
 * 1) SINGLE NORMALIZATION FUNCTION (MANDATORY)
 * Applies ONLY the four allowed rules:
 * - Trim whitespace
 * - Replace / with -
 * - Collapse multiple spaces
 * - Remove leading/trailing dots
 */
function normalizeFolderName(input: string): string {
  return input
    .trim()
    .replace(/\//g, '-')           // Replace / with -
    .replace(/\s+/g, ' ')          // Collapse multiple spaces
    .replace(/^\.+|\.+$/g, '');    // Remove leading/trailing dots
}

/**
 * 2) SINGLE PATH BUILDER (MANDATORY)
 * builds path in this exact order: Country -> City -> Type
 */
function buildLibraryPath(country: string, city: string, type: string): {
  segments: string[];
  pathString: string;
} {
  const normCountry = normalizeFolderName(country);
  const normCity = normalizeFolderName(city);
  const normType = normalizeFolderName(type);

  return {
    segments: [normCountry, normCity, normType],
    pathString: `/${normCountry}/${normCity}/${normType}/`
  };
}

export async function organizeBrollFiles(
  drive: DriveClient,
  masterFile: BrollFile,
  proxyFile: BrollFile,
  suggestedName: string,
  rawCountry: string,
  rawCity: string,
  type: CanonicalType
): Promise<MoveResult> {
  const LIBRARY_ROOT_ID = process.env.GOOGLE_DRIVE_LIBRARY_FOLDER_ID;
  if (!LIBRARY_ROOT_ID) throw new Error('FATAL: GOOGLE_DRIVE_LIBRARY_FOLDER_ID is not set.');

  // Normalize Filename (using same strict rules, NO kebab-case)
  const safeFilename = normalizeFolderName(suggestedName);
  
  // Build Deterministic Path
  const { segments, pathString } = buildLibraryPath(rawCountry, rawCity, type);
  const [countryName, cityName, typeName] = segments;

  console.log(`\n📦 Organization Module Started`);
  console.log(`   Target Path: ${pathString}`);
  console.log(`   Target File: ${safeFilename}`);

  try {
    // 1. RESOLVE FOLDER STRUCTURE (Deterministic)
    
    // Level 1: Country
    let countryId = await findFolder(drive, LIBRARY_ROOT_ID, countryName);
    if (!countryId) {
      console.log(`   + Creating Country folder: ${countryName}`);
      countryId = await createFolder(drive, LIBRARY_ROOT_ID, countryName);
    }

    // Level 2: City
    let cityId = await findFolder(drive, countryId, cityName);
    if (!cityId) {
      console.log(`   + Creating City folder: ${cityName}`);
      cityId = await createFolder(drive, countryId, cityName);
    }

    // Level 3: Type
    let typeId = await findFolder(drive, cityId, typeName);
    if (!typeId) {
      console.log(`   + Creating Type folder: ${typeName}`);
      typeId = await createFolder(drive, cityId, typeName);
    }

    // 2. RENAME MASTER
    // Extract extension from original master name (e.g., .mov, .mp4)
    const ext = masterFile.name.includes('.') ? masterFile.name.split('.').pop() : 'mov'; 
    const finalName = `${safeFilename}.${ext}`;

    await drive.files.update({
      fileId: masterFile.id,
      requestBody: { name: finalName },
    });
    console.log(`   ✔ Renamed Master to: ${finalName}`);

    // 3. MOVE MASTER
    // Drive API requires removing the old parent explicitly
    const fileData = await drive.files.get({ fileId: masterFile.id, fields: 'parents' });
    const previousParents = fileData.data.parents?.join(',') || '';

    await drive.files.update({
      fileId: masterFile.id,
      addParents: typeId,
      removeParents: previousParents,
      fields: 'id, parents',
    });
    console.log(`   ✔ Moved Master to: .../${cityName}/${typeName}/`);

    // 4. VERIFY MOVE (Safety Check)
    const verification = await drive.files.get({
      fileId: masterFile.id,
      fields: 'parents',
    });
    
    const isSafe = verification.data.parents?.includes(typeId);
    
    if (!isSafe) {
      throw new Error(`CRITICAL: Verification failed. Master file ${masterFile.id} is NOT in target folder ${typeId}. Aborting proxy deletion.`);
    }

    // 5. DELETE PROXY
    // Only executed if Step 4 passes
    await drive.files.update({
      fileId: proxyFile.id,
      requestBody: { trashed: true },
    });
    console.log(`   🗑 Proxy file trashed (Safety check passed).`);

    return {
      success: true,
      newPath: `${pathString}${finalName}`, // Full virtual path for DB
      masterId: masterFile.id
    };

  } catch (error) {
    console.error(`❌ Organization Failed:`, error);
    throw error;
  }
}

// --- HELPER FUNCTIONS ---

async function findFolder(drive: DriveClient, parentId: string, name: string): Promise<string | null> {
  // Note: 'name = ...' in Drive query is case-sensitive, which aligns with "No lowercasing" rule.
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