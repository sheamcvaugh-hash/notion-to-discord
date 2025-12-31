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

* **`country`**: Must match a folder name in `Processing Queue` exactly (case-sensitive).
* **`city`**: The location context for the files currently in that queue.

## 2. Expected Behavior

When triggered, the system will:
1.  Verify the inputs are strings.
2.  Spawn a background worker (`main.ts`).
3.  Scan `Queue/Mexico/` for `*_low.*` files.
4.  Process them one by one.

## 3. Logs & Monitoring

**Success Indicators:**
* Log: `🚀 B-Roll Processor Starting...`
* Log: `📍 Context: Country = Mexico, City = Querétaro`
* Log: `✅ Cycle Complete for this clip!`

**Common Failures:**
* `🔥 FATAL: No Country provided.`
    * *Cause:* API payload missing keys or empty strings.
* `Queue folder for country 'X' does not exist.`
    * *Cause:* Typo in `country` payload vs Drive folder name.
* `Gemini signaled INVALID_OUTPUT.`
    * *Cause:* Video was unrecognizable or violated safety guidelines.
* `CRITICAL: Verification failed. Master file ... is NOT in target folder.`
    * *Cause:* Drive API latency or permissions issue. The proxy is **not** deleted in this case.

## 4. Emergency Stop
To stop a running process:
1.  Identify the `ts-node` process or the Node container.
2.  Kill the process.
3.  **Recovery:** The system is idempotent. You can re-run the same trigger; files already processed (in DB) will be skipped (`⏩ Skipping: Master file ... is already in the database`).