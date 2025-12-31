# System Architecture (As Built)

This document describes the **current reality** of the B-Roll Processing System.

## Data Flow Pipeline

1.  **Trigger (API):** External request initiates the process for a specific Country + City.
2.  **Scan (Drive):** System looks for proxy files (`_low`) in `Queue/<Country>/`.
3.  **Analyze (Gemini):** Proxy is sent to Gemini 1.5 Flash for metadata extraction.
4.  **Validate (Logic):** AI output is checked against a strict schema (types, forbidden chars).
5.  **Organize (Drive):** Master file is renamed and moved to `Library/<Country>/<City>/<Type>/`.
6.  **Index (Supabase):** Metadata is written to `broll_media_index`.

## Component Responsibilities

### 1. API Entry Point (`index.js`)
* **Role:** Guardrail and Trigger.
* **Responsibility:**
    * Validates existence of `country` and `city` in the request body.
    * Spawns the worker process (`main.ts`).
* **Boundary:** Rejects requests missing required context.

### 2. Orchestrator (`src/broll/main.ts`)
* **Role:** The "Main Loop".
* **Responsibility:**
    * Accepts CLI arguments: `Country`, `City`.
    * Iterates through found proxy files.
    * Handles "Fail Safe" logic (errors log and skip; process does not crash).
    * Links Proxy files back to Master files.

### 3. Queue Scanner (`src/broll/scanQueue.ts`)
* **Role:** Input Discovery.
* **Responsibility:**
    * Scans **strictly** `Queue/<Country>/`.
    * Ignores files that do not match `_low` or video mime types.
    * **Invariant:** Does not scan the entire root; scoped to the triggered Country.

### 4. Gemini Analyzer (`src/broll/gemini.ts`)
* **Role:** Intelligence.
* **Responsibility:**
    * Uploads temporary proxy to Gemini.
    * Sends **Strict System Prompt**.
    * Returns raw JSON.
    * **Invariant:** Must return exactly 4 keys: `suggested_filename`, `tags`, `type`, `summary`.

### 5. Drive Organizer (`src/broll/organizeDrive.ts`)
* **Role:** File System State Mutation.
* **Responsibility:**
    * Normalizes strings (Trim, collapse spaces, replace `/` with `-`).
    * Creates folder hierarchy: `Library` -> `Country` -> `City` -> `Type`.
    * Renames Master file.
    * Moves Master file.
    * **Deletes Proxy file** (only after verification of move).

### 6. Validator (`src/broll/types.ts`)
* **Role:** Gatekeeper.
* **Responsibility:**
    * Throws errors if Gemini output contains extra keys.
    * Throws errors if `Type` is not in the `CanonicalType` Enum.
    * Throws errors if filename contains forbidden characters (`#`, `[`, `]`, `/`).