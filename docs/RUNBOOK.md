# B-Roll System Runbook

**For Human Operators.** This guide explains how to trigger and monitor the system.

## 1. Triggering Processing

Processing is not continuous. It is event-driven via HTTP POST.

**Endpoint:** `POST /api/process-broll`  
**Headers:** `Content-Type: application/json`

**Required Payload:**
```json
{
  "country": "Mexico",
  "city": "Querétaro"
}
```

- **country:** Must match a folder name in Processing Queue exactly (case-sensitive).
- **city:** The location context for the files currently in that queue.

## 2. Expected Behavior

When triggered, the system will:

- Verify the inputs are strings.
- Spawn a background worker (`main.ts`).
- Scan `Queue/Mexico/` for `*_low.*` files.
- Process them one by one.
- Move processed masters to the Library.
- Move processed proxies to the Outbox folder. *(Proxies are NEVER deleted).*

## 3. Logs & Monitoring

### Success Indicators

- Log: 🚀 B-Roll Processor Starting...
- Log: 📍 Context: Country = Mexico, City = Querétaro
- Log: `[Gemini] Using model: gemini-2.0-flash-exp`
- Log: ✔ Proxy moved to Outbox (ID: ...)
- Log: ✅ Cycle Complete for this clip!

### Common Failures

- **🔥 FATAL: No Country provided.**  
  Cause: API payload missing keys or empty strings.

- **Queue folder for country 'X' does not exist.**  
  Cause: Typo in country payload vs Drive folder name.

- **[Gemini] Request failed: ...**  
  Cause: The specific hard-coded model failed or is down. The system does not retry.

- **Gemini signaled INVALID_OUTPUT.**  
  Cause: Video was unrecognizable or violated safety guidelines.

- **CRITICAL: Verification failed. Master file ... is NOT in target folder.**  
  Cause: Drive API latency or permissions issue. The proxy remains in the Queue.

## 4. Emergency Stop

To stop a running process:

1. Identify the `ts-node` process or the Node container.
2. Kill the process.

**Recovery:** The system is idempotent. You can re-run the same trigger; files already processed (in DB) will be skipped:  
(⏩ Skipping: Master file ... is already in the database)

## 5. Maintenance (Manual)

- **Outbox Purge:** The Outbox folder accumulates `_low` proxy files. These must be deleted manually via Google Drive UI when desired. The system will never delete them automatically.

## 6. System Configuration

- **Gemini Model:** The AI model is fixed and hard-coded in `src/broll/gemini.ts`.
- **Current Model:** `gemini-2.0-flash-exp`
- **No Fallback:** There is no retry logic or model switching. If this model fails, the clip fails.
- **To Change:** You must edit the `GEMINI_MODEL` constant in the source code and redeploy.
