// src/broll/filename.ts

/**
 * Normalizes the slug using the established rules:
 * - Trim whitespace
 * - Replace / with -
 * - Collapse multiple spaces
 * - Remove leading/trailing dots
 * - (Does NOT enforce Title Case; assumes input is already cased or accepts as is)
 */
function normalizeSlug(input: string): string {
  return input
    .trim()
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '');
}

/**
 * Constructs the deterministic, unique filename.
 * Format: <HumanSlug>__<ShortId>.<EXT>
 */
export function buildFinalMasterFilename(
  suggestedFilename: string,
  masterDriveFileId: string,
  originalName: string
): string {
  // 1. Normalize Human Slug
  const slug = normalizeSlug(suggestedFilename);

  // 2. Compute Short ID (Last 6 chars of Drive ID)
  const shortId = masterDriveFileId.slice(-6);

  // 3. Determine Extension (Preserve original casing if present, default to .MOV)
  const ext = originalName.includes('.') 
    ? originalName.split('.').pop() 
    : 'MOV';

  // 4. Return Final Format
  // Example: Black-Burger-And-Fries__TuVwxY.MOV
  return `${slug}__${shortId}.${ext}`;
}