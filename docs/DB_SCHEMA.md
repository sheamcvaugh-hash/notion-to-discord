# Database Schema Specification (Phase 3)

**Table:** `broll_media_index`
**Purpose:** Authoritative log of all processed B-roll clips.
**Status:** LOCKED. No new columns allowed without formal review.

## Columns

| Column Name | Data Type | Constraint | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PK, Default `gen_random_uuid()` | Unique Record ID. |
| `created_at` | TIMESTAMPTZ | Default `now()` | Auto-timestamp. |
| `updated_at` | TIMESTAMPTZ | Default `now()` | Auto-timestamp. |
| `country` | TEXT | `NOT NULL`, Check `<> ''` | **Source of Truth.** Derived from Queue folder name. |
| `city` | TEXT | `NOT NULL`, Check `<> ''` | Provided by API Trigger. |
| `type` | TEXT | `NOT NULL`, Enum Check | **Strict Enum.** Must be one of the 9 Canonical Types. |
| `tags` | TEXT[] | `NOT NULL` | Array of 3-5 keywords. |
| `summary` | TEXT | `NOT NULL` | One-sentence description. |
| `file_name` | TEXT | `NOT NULL` | Final filename (e.g., `coffee-shop.mov`). |
| `drive_file_id` | TEXT | `UNIQUE`, `NOT NULL` | Google Drive File ID (Master). |
| `drive_library_path` | TEXT | `NOT NULL` | Full path: `Library/Country/City/Type/File`. |

## Constraints & Enums

### Canonical Type List (Case Sensitive)
1. Food
2. City
3. People
4. Gear
5. Animals
6. Place
7. Transit
8. Nature
9. Action/Activity

### Forbidden Columns (Do Not Restore)
* `time_of_day`
* `color_palette`
* `mime_type`
* `processed_at`
* `description` (Use `summary`)
* `canonical_path`
* `drive_id` (Use `drive_file_id`)