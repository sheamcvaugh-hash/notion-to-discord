# Drive Folder & Path Specification (Phase 3)

**Root Structure:**
* **Library Root** (`GOOGLE_DRIVE_LIBRARY_FOLDER_ID`)

## 1. Input Processing
* Input scanning logic is handled by the Queue Scanner (external to this spec).
* This document governs **Output** structure and **Normalization** only.

## 2. B-Roll Library (Automated Output)
* **Canonical Path:** `Library Root / <Country> / <City> / <Type> /`
* **Constraint:** This path is deterministic. No fallbacks. No "Misc" folders.

### Normalization Rules
Folder and file names are normalized using **only** the following rules, applied in this order:
1.  Trim leading and trailing whitespace.
2.  Replace all `/` characters with `-`.
3.  Collapse multiple spaces into a single space.
4.  Remove leading and trailing periods (`.`).

**Forbidden Transformations:**
* No Lowercasing or Uppercasing.
* No Kebab-case or Snake_case.
* No Transliteration.
* No removal of special characters (other than `/`).
* No Emoji stripping.

### Folder Creation
* **Country:** Created if missing using normalized name.
* **City:** Created if missing using normalized name.
* **Type:** Created if missing using normalized name.

### File Naming
* **Format:** `<Normalized-Suggested-Name>.<ext>`
* Applies the same normalization rules as folders.
* Preserves original casing.