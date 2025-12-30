# Project Overview

## Repository Identity
**Name:** notion-to-discord
**Hosting:** Fly.io
**Runtime:** Node.js

## Core Functionality
1.  **Notion Relay (Legacy/Stable):** Periodically polls Notion databases to send formatted updates to Discord webhooks.
2.  **B-Roll Indexer (New Scope):** An agent that monitors a Google Drive root folder, processes video files via Gemini 1.5, and indexes metadata into Supabase.

## Environment & Infrastructure
* **Production:** Fly.io (Region: `qro`)
* **Database:** Supabase (PostgreSQL)
* **AI Model:** Gemini 1.5
* **Storage:** Google Drive

## Operational context
* The application is stateless; all persistence is handled via Supabase.
* Authentication for Google Drive is handled via Service Account credentials.
* Secrets are managed via Fly.io secrets management.