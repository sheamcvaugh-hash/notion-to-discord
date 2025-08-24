// ——— DEPENDENCIES & SETUP ——— //
const express = require("express");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 3000;

// Built-in JSON parsing (no body-parser needed)
app.use(express.json({ limit: "1mb" }));

// ——— ENV GUARD ——— //
const {
  DISCORD_WEBHOOK_GLOBAL,
  DISCORD_WEBHOOK_PERSONAL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RELAY_TOKEN, // shared secret for ChatGPT → Relay auth
} = process.env;

function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
}
requireEnv("SUPABASE_URL");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// ——— HELPERS ——— //
function buildMessage(entry) {
  // Pass through as-is, nicely formatted for Discord
  return { content: JSON.stringify(entry, null, 2) };
}

function authOk(req) {
  // Expect: Authorization: Bearer <RELAY_TOKEN>
  if (!RELAY_TOKEN) return true; // if no token set, allow (useful for local dev)
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  return token && token === RELAY_TOKEN;
}

// Normalize incoming ChatGPT payloads into our brain_queue shape
function mapToBrainQueue(body) {
  // Accept a few common shapes:
  // { raw_text, destination, source, metadata }
  // { text, destination, source, metadata }
  // { message: "...", ... }
  const raw_text =
    body.raw_text ??
    body.text ??
    body.message ??
    (typeof body === "string" ? body : "");

  const destination = body.destination || "digital_brain"; // default
  const source = body.source || "ChatGPT";
  const metadata = body.metadata || {};

  if (!raw_text || typeof raw_text !== "string") {
    const err = new Error("Invalid payload: missing string field `raw_text` (or `text`/`message`).");
    err.status = 400;
    throw err;
  }

  // Supabase columns: raw_text (text), source (text/enum), status (enum), destination (text), metadata (jsonb)
  return {
    raw_text,
    source,
    status: "Pending",
    destination,
    metadata,
  };
}

// ——— SUPABASE (REST) ——— //
async function insertBrainQueueRow(row) {
  const url = `${SUPABASE_URL}/rest/v1/brain_queue`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const { data } = await axios.post(url, [row], { headers });
  // data is an array with the inserted row(s)
  return data?.[0];
}

// ——— EXISTING: MANUAL POST TEST ROUTE (Discord) ——— //
app.post("/", async (req, res) => {
  try {
    const messagePayload = buildMessage(req.body);
    await Promise.all([
      DISCORD_WEBHOOK_GLOBAL
        ? axios.post(DISCORD_WEBHOOK_GLOBAL, messagePayload)
        : Promise.resolve(),
      DISCORD_WEBHOOK_PERSONAL
        ? axios.post(DISCORD_WEBHOOK_PERSONAL, messagePayload)
        : Promise.resolve(),
    ]);
    res.status(200).send("✅ Message sent to configured Discord channels");
  } catch (error) {
    console.error("❌ Error posting to Discord:", error.response?.data || error.message);
    res.status(500).send("Failed to post to Discord");
  }
});

// ——— NEW: CHATGPT → BRAIN QUEUE INGEST ——— //
app.post("/brain-queue", async (req, res) => {
  try {
    if (!authOk(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const row = mapToBrainQueue(req.body);
    const inserted = await insertBrainQueueRow(row);

    // Optional: fan-out to Discord for visibility
    try {
      const messagePayload = buildMessage({ route: "brain-queue", inserted });
      if (DISCORD_WEBHOOK_GLOBAL) await axios.post(DISCORD_WEBHOOK_GLOBAL, messagePayload);
      if (DISCORD_WEBHOOK_PERSONAL) await axios.post(DISCORD_WEBHOOK_PERSONAL, messagePayload);
    } catch (e) {
      // Non-fatal; keep ingest success
      console.warn("⚠️ Discord fan-out failed:", e.response?.data || e.message);
    }

    res.status(201).json({ ok: true, id: inserted?.id, inserted });
  } catch (err) {
    const status = err.status || 500;
    console.error("❌ Ingest error:", err.response?.data || err.message);
    res.status(status).json({ ok: false, error: err.message || "Ingest failed" });
  }
});

// ——— HEALTHCHECK ENDPOINT ——— //
app.get("/keepalive", (_req, res) => {
  res.status(200).send("👋 I'm alive");
});

// ——— START SERVER ——— //
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
