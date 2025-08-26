// ——— DEPENDENCIES & SETUP ——— //
const express = require("express");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

// ——— ENV ——— //
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

// ——— AUTH ——— //
function authOk(req) {
  // Expect: Authorization: Bearer <RELAY_TOKEN>
  if (!RELAY_TOKEN) return true; // allow if not set (useful for local/dev)
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  return token && token === RELAY_TOKEN;
}

// ——— HELPERS ——— //
function buildMessage(entry) {
  // Pass through as-is, nicely formatted for Discord
  return { content: JSON.stringify(entry, null, 2) };
}

function sanitizeString(s) {
  return typeof s === "string" ? s.trim() : "";
}

// Normalize incoming payloads into our brain_queue shape
function mapToBrainQueue(body, metaFrom = null) {
  const raw_text =
    sanitizeString(body.raw_text) ||
    sanitizeString(body.text) ||
    sanitizeString(body.message) ||
    (typeof body === "string" ? sanitizeString(body) : "");

  const destination = sanitizeString(body.destination) || "digital_brain";
  const source = sanitizeString(body.source) || "ChatGPT";
  const metadataBase =
    typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {};

  if (!raw_text) {
    const err = new Error(
      "Invalid payload: missing string field `raw_text` (or `text`/`message`)."
    );
    err.status = 400;
    throw err;
  }

  const metadata = {
    ...metadataBase,
    ...(metaFrom ? { from: metaFrom } : {}),
  };

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
  return data?.[0];
}

// ——— COMMAND PARSER ——— //
const COMMAND_MAP = {
  "/save": "digital_brain",
  "/savepersonal": "deep_personal",
  "/savewayfinder": "deep_wayfinder",
  "/savemegaclicks": "deep_megaclicks",
  "/savesystem": "deep_system",
};

function parseSlashCommand(input) {
  const text = sanitizeString(input);
  if (!text.startsWith("/")) {
    return null;
  }

  // Split on whitespace; first token is the command
  const firstSpace = text.indexOf(" ");
  const cmd = (firstSpace === -1 ? text : text.slice(0, firstSpace)).toLowerCase();
  const rest = sanitizeString(firstSpace === -1 ? "" : text.slice(firstSpace + 1));

  if (!COMMAND_MAP[cmd]) {
    return null;
  }
  if (!rest) {
    const err = new Error(`Command '${cmd}' requires text to save after the command.`);
    err.status = 400;
    throw err;
  }

  return {
    command: cmd,
    destination: COMMAND_MAP[cmd],
    raw_text: rest,
  };
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

// ——— CHATGPT → BRAIN QUEUE (JSON payload) ——— //
app.post("/brain-queue", async (req, res) => {
  try {
    if (!authOk(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const row = mapToBrainQueue(req.body);
    const inserted = await insertBrainQueueRow(row);

    try {
      const messagePayload = buildMessage({ route: "brain-queue", inserted });
      if (DISCORD_WEBHOOK_GLOBAL) await axios.post(DISCORD_WEBHOOK_GLOBAL, messagePayload);
      if (DISCORD_WEBHOOK_PERSONAL) await axios.post(DISCORD_WEBHOOK_PERSONAL, messagePayload);
    } catch (e) {
      console.warn("⚠️ Discord fan-out failed:", e.response?.data || e.message);
    }

    res.status(201).json({ ok: true, id: inserted?.id, inserted });
  } catch (err) {
    const status = err.status || 500;
    console.error("❌ Ingest error:", err.response?.data || err.message);
    res.status(status).json({ ok: false, error: err.message || "Ingest failed" });
  }
});

// ——— NEW: SLASH COMMAND INGEST ——— //
// Accepts either:
// { "command": "/save your text..." }   OR
// { "message": "/save your text..." }   OR
// raw string body "/save your text..." (if client sends text/plain + express.json won't parse)
// We expect JSON, but we handle both shapes above.
app.post("/command", async (req, res) => {
  try {
    if (!authOk(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body;
    const raw =
      (typeof body === "string" ? body : "") ||
      sanitizeString(body?.command) ||
      sanitizeString(body?.message) ||
      "";

    const parsed = parseSlashCommand(raw);
    if (!parsed) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid command. Use one of: /save, /savepersonal, /savewayfinder, /savemegaclicks, /savesystem followed by your text.",
      });
    }

    const row = mapToBrainQueue(
      {
        raw_text: parsed.raw_text,
        destination: parsed.destination,
        source: "ChatGPT",
        metadata: {},
      },
      parsed.command // meta.from
    );

    const inserted = await insertBrainQueueRow(row);

    try {
      const messagePayload = buildMessage({ route: "command", command: parsed.command, inserted });
      if (DISCORD_WEBHOOK_GLOBAL) await axios.post(DISCORD_WEBHOOK_GLOBAL, messagePayload);
      if (DISCORD_WEBHOOK_PERSONAL) await axios.post(DISCORD_WEBHOOK_PERSONAL, messagePayload);
    } catch (e) {
      console.warn("⚠️ Discord fan-out failed:", e.response?.data || e.message);
    }

    res.status(201).json({ ok: true, id: inserted?.id, inserted });
  } catch (err) {
    const status = err.status || 500;
    console.error("❌ Command ingest error:", err.response?.data || err.message);
    res.status(status).json({ ok: false, error: err.message || "Command ingest failed" });
  }
});

// ——— BRAIN READ API ——— //

import { queryDigitalBrain, queryDeepBrain, synthesizeBrainData } from './core-logic.js';

// Optional: simple bearer check for read calls
function requireReadKey(req, res, next) {
  const key = process.env.READ_API_KEY;
  if (!key) return next(); // no key set → open (dev)
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${key}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.use('/brain', requireReadKey);

// GET /brain/digital?type=Preference,Goal&tags=travel,protein&confidence=High,Medium&source=ChatGPT&limit=10
app.get('/brain/digital', async (req, res) => {
  try {
    const parseList = (q) => (q ? String(q).split(',').map(s => s.trim()).filter(Boolean) : undefined);
    const criteria = {
      type: parseList(req.query.type),
      tags: parseList(req.query.tags),
      confidence: parseList(req.query.confidence),
      source: parseList(req.query.source),
    };
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);
    const data = await queryDigitalBrain(criteria, limit);
    res.json({ ok: true, count: data.length, data });
  } catch (e) {
    console.error('GET /brain/digital error:', e);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

// GET /brain/deep/:table?type=Journal,Systems&tags=Obsidian,planning&confidence=High&limit=10
app.get('/brain/deep/:table', async (req, res) => {
  try {
    const table = String(req.params.table || '');
    const parseList = (q) => (q ? String(q).split(',').map(s => s.trim()).filter(Boolean) : undefined);
    const criteria = {
      type: parseList(req.query.type),
      tags: parseList(req.query.tags),
      confidence: parseList(req.query.confidence),
    };
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 100);
    const data = await queryDeepBrain(table, criteria, limit);
    res.json({ ok: true, table, count: data.length, data });
  } catch (e) {
    console.error('GET /brain/deep error:', e);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

// POST /brain/synthesize  { entries: [...], prompt?: "optional guidance" }
app.post('/brain/synthesize', async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const prompt = String(req.body?.prompt || '');
    const summary = await synthesizeBrainData(entries, prompt);
    res.json({ ok: true, summary });
  } catch (e) {
    console.error('POST /brain/synthesize error:', e);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

// ——— END BRAIN READ API ——— //



// ——— HEALTHCHECK ENDPOINT ——— //
app.get("/keepalive", (_req, res) => {
  res.status(200).send("👋 I'm alive");
});

// ——— START SERVER ——— //
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
