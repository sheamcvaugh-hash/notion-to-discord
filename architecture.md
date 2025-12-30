# Architecture (Stub)

## System Components

### 1. The B-Roll Agent
* **Trigger:** Manual invocation or scheduled cron (TBD in later phases).
* **Input:** Scans a defined `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
* **Processing:**
    * Extracts file metadata (name, ID, path).
    * Generates content summary and tags using Gemini API.
* **Output:** Upserts records into the `broll_media_index` Supabase table.

## Data Schema
See `broll_media_index.sql` for the authoritative schema definition.

## External Dependencies
1.  **Google Drive API:** Read access for video files.
2.  **Gemini API:** Context window analysis for video summarization.
3.  **Supabase:** Relational data storage.
4.  **Discord:** Notification endpoints (via `DISCORD_WEBHOOK_*`).