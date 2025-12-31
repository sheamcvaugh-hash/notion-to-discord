# Project Overview: B-Roll Processing System

## High-Level Description
The B-Roll System is a deterministic, automated pipeline designed to ingest raw video proxies from Google Drive, analyze them using Gemini 1.5 Flash, organize them into a structured "Library" hierarchy, and index them into Supabase.

It connects a "Processing Queue" (where files land) to a "Media Library" (where files live), bridging the gap with strict validation and minimal AI interpretation.

## Problems Solved
* **The "Pile of Files" Problem:** Converts a flat list of `IMG_1234_low.mov` files into a searchable, categorized library.
* **Inconsistent Naming:** Enforces a rigid naming convention without human intervention.
* **Missing Metadata:** Generates searchable tags, summaries, and canonical types for every clip.

## Problems NOT Solved
* **Quality Evaluation:** The system does **not** judge if a clip is "good" or "bad". It processes everything in the queue.
* **Location Inference:** The system does **not** guess where a clip was taken. Location (Country/City) must be provided explicitly at trigger time.
* **Video Editing:** The system manages file organization and metadata, not video content.

## Hard Constraints (System Dogma)
1.  **No Automatic Inference:** Country and City are inputs, never outputs. We do not trust AI to read street signs.
2.  **Strict Schema:** The AI output is rigidly constrained to 4 specific keys. No "extra" interesting data is allowed.
3.  **Deterministic Organization:** A file processed twice with the same inputs will result in the exact same path and filename.
4.  **No Prompt Tuning:** The prompts are locked. We do not "chat" with the video; we extract data.

## Target Audience
* **New Developers:** Read `ARCHITECTURE.md` to understand the data flow.
* **Operators:** Read `RUNBOOK.md` to trigger processing.
* **LLMs:** Read `LLM_HANDOFF.md` before suggesting ANY code changes.