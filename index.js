require('dotenv').config();

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
  GHL_API_KEY, // GoHighLevel Location API key (v1)
  GHL_LOCATION_ID, // optional, kept for reference
  SUBSTACK_WEBHOOK_TOKEN, // shared secret for Substack webhooks (?token=...)
  AGENT_20_URL,          // our own public URL
  GITHUB_PERSONAL_ACCESS_TOKEN, // fine-grained PAT, read-only
} = process.env;

function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`Missing required env var: ${name}`);
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

// ——— SUPABASE WRITE — NOW SMART (Agent 20 ready) ——— //
async function insertBrainQueueRow(row) {
  // If we have our own public URL configured → route writes through Agent 20 endpoint
  if (AGENT_20_URL) {
    const url = `${AGENT_20_URL}/agent20-write`;
    const headers = {
      "Content-Type": "application/json",
      "x-relay-token": RELAY_TOKEN || "", // extra safety
    };
    const { data } = await axios.post(url, { row }, { headers });
    return data?.inserted;
  }

  // Fallback: old direct write (still works locally or if you ever remove the var)
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

// ——— GOHIGHLEVEL (CONTACTS, API v1) ——— //
// Uses v1 API with Location API key:
//   POST https://rest.gohighlevel.com/v1/contacts/
//   Authorization: Bearer <GHL_API_KEY>
async function createOrUpdateGhlContactFromSubstack(subscriber) {
  if (!GHL_API_KEY) {
    const err = new Error(
      "Missing GHL_API_KEY env var; cannot sync to GoHighLevel."
    );
    err.status = 500;
    throw err;
  }

  const email =
    sanitizeString(subscriber.email) ||
    sanitizeString(subscriber.email_address) ||
    sanitizeString(subscriber.addr);

  if (!email) {
    const err = new Error("Missing subscriber email in request body.");
    err.status = 400;
    throw err;
  }

  const firstName =
    sanitizeString(subscriber.first_name) ||
    sanitizeString(subscriber.firstName) ||
    "";
  const lastName =
    sanitizeString(subscriber.last_name) ||
    sanitizeString(subscriber.lastName) ||
    "";

  // Treat any truthy `paid` flag as a paid subscriber; default to free
  const isPaid =
    subscriber.paid === true ||
    subscriber.is_paid === true ||
    sanitizeString(subscriber.tier) === "paid";

  const tags = ["substack", isPaid ? "substack_paid" : "substack_free"];

  // v1 contacts endpoint (API key auth)
  const url = "https://rest.gohighlevel.com/v1/contacts/";
  const headers = {
    Authorization: `Bearer ${GHL_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const payload = {
    email,
    firstName,
    lastName,
    tags,
    source: "Substack",
  };

  const { data } = await axios.post(url, payload, { headers });
  return data;
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

// ——— GITHUB HELPERS ——— //
function requireGithubToken() {
  if (!GITHUB_PERSONAL_ACCESS_TOKEN) {
    const err = new Error(
      "Missing GITHUB_PERSONAL_ACCESS_TOKEN env var; GitHub proxy routes are disabled."
    );
    err.status = 500;
    throw err;
  }
}

async function githubRequest(method, url, params = {}, data = null) {
  requireGithubToken();
  const headers = {
    Authorization: `Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "agent20-fly-relay",
  };

  const config = {
    method,
    url,
    headers,
    params,
    data,
  };

  const response = await axios(config);
  return response.data;
}

// ——— AGENT 20 WRITE ENDPOINT (this is where the real brain will live later) ——— //
app.post("/agent20-write", async (req, res) => {
  if (RELAY_TOKEN && !authOk(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { row } = req.body;
  if (!row) {
    return res.status(400).json({ error: "Missing row in body" });
  }

  try {
    // Right now it just writes straight to Supabase (exactly like before)
    // Later you’ll put xAI parsing, embeddings, rate-limiting, etc. here
    const url = `${SUPABASE_URL}/rest/v1/brain_queue`;
    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const { data } = await axios.post(url, [row], { headers });
    const inserted = data?.[0];

    res.json({ ok: true, inserted });
  } catch (err) {
    console.error("Agent20 write failed:", err.response?.data || err.message);
    res.status(500).json({ error: "Write failed" });
  }
});

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
    res.status(200).send("Message sent to configured Discord channels");
  } catch (error) {
    console.error("Error posting to Discord:", error.response?.data || error.message);
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
      console.warn("Discord fan-out failed:", e.response?.data || e.message);
    }

    res.status(201).json({ ok: true, id: inserted?.id, inserted });
  } catch (err) {
    const status = err.status || 500;
    console.error("Ingest error:", err.response?.data || err.message);
    res.status(status).json({ ok: false, error: err.message || "Ingest failed" });
  }
});

// ——— NEW: SLASH COMMAND INGEST ——— //
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
      console.warn("Discord fan-out failed:", e.response?.data || e.message);
    }

    res.status(201).json({ ok: true, id: inserted?.id, inserted });
  } catch (err) {
    const status = err.status || 500;
    console.error("Command ingest error:", err.response?.data || err.message);
    res.status(status).json({ ok: false, error: err.message || "Command ingest failed" });
  }
});

// ——— SUBSTACK → GOHIGHLEVEL CONTACT SYNC ——— //
// Webhook endpoint for Substack.
// Secure via ?token=... using SUBSTACK_WEBHOOK_TOKEN.
app.post("/substack-subscriber", async (req, res) => {
  try {
    // Substack can't set Authorization headers, so we use a URL token:
    // https://notion-to-discord.fly.dev/substack-subscriber?token=XYZ
    if (SUBSTACK_WEBHOOK_TOKEN) {
      const token =
        sanitizeString(req.query.token) ||
        sanitizeString(req.headers["x-substack-token"]);
      if (!token || token !== SUBSTACK_WEBHOOK_TOKEN) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const subscriber = req.body || {};
    const ghlResult = await createOrUpdateGhlContactFromSubstack(subscriber);

    try {
      const messagePayload = buildMessage({
        route: "substack-subscriber",
        subscriber,
        ghlResult,
      });
      if (DISCORD_WEBHOOK_GLOBAL) await axios.post(DISCORD_WEBHOOK_GLOBAL, messagePayload);
      if (DISCORD_WEBHOOK_PERSONAL) await axios.post(DISCORD_WEBHOOK_PERSONAL, messagePayload);
    } catch (e) {
      console.warn("Discord fan-out failed:", e.response?.data || e.message);
    }

    res.status(201).json({ ok: true, ghlResult });
  } catch (err) {
    const status = err.status || 500;
    console.error("Substack → GHL sync error:", err.response?.data || err.message);
    res.status(status).json({ ok: false, error: err.message || "Sync failed" });
  }
});

// ——— GITHUB PROXY ROUTES ——— //

// List repos visible to the token (for sanity / discovery)
app.get("/github/repos", async (req, res) => {
  try {
    if (!authOk(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const params = {
      per_page: Math.min(parseInt(req.query.per_page, 10) || 50, 100),
      page: parseInt(req.query.page, 10) || 1,
      sort: "updated",
      direction: "desc",
    };

    const data = await githubRequest("GET", "https://api.github.com/user/repos", params);
    // Trim to fields an LLM actually needs
    const repos = data.map((r) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      private: r.private,
      default_branch: r.default_branch,
      html_url: r.html_url,
      updated_at: r.updated_at,
    }));

    res.json({ ok: true, repos });
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    console.error("GitHub repos error:", err.response?.data || err.message);
    res.status(status).json({ ok: false, error: err.message || "GitHub repos fetch failed" });
  }
});

// Fetch a single file's contents from a repo
app.get("/github/file", async (req, res) => {
  try {
    if (!authOk(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const owner = sanitizeString(req.query.owner);
    const repo = sanitizeString(req.query.repo);
    const path = sanitizeString(req.query.path);
    const ref = sanitizeString(req.query.ref) || undefined; // branch/commit/sha

    if (!owner || !repo || !path) {
      return res.status(400).json({
        ok: false,
        error: "Missing required query params: owner, repo, path",
      });
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(
      path
    )}`;

    const data = await githubRequest("GET", url, ref ? { ref } : {});

    if (Array.isArray(data)) {
      // They requested a directory, not a file
      const listing = data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
      }));
      return res.json({ ok: true, directory: true, items: listing });
    }

    if (!data.content || data.encoding !== "base64") {
      return res.json({
        ok: true,
        binary: true,
        encoding: data.encoding,
        size: data.size,
        path: data.path,
        sha: data.sha,
      });
    }

    const buff = Buffer.from(data.content, "base64");
    const text = buff.toString("utf8");

    res.json({
      ok: true,
      owner,
      repo,
      path: data.path,
      sha: data.sha,
      size: data.size,
      encoding: "utf8",
      ref: ref || null,
      content: text,
    });
  } catch (err) {
    const status = err.status || err.response?.status || 500;
    console.error("GitHub file error:", err.response?.data || err.message);
    res.status(status).json({ ok: false, error: err.message || "GitHub file fetch failed" });
  }
});

// ——— AGENT 20 READ PROXY ——— //
app.post("/brain-read", async (req, res) => {
  try {
    const READ_API_KEY = process.env.READ_API_KEY || "";

    // Simple API key guard (separate from RELAY_TOKEN)
    if (!READ_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "READ_API_KEY is not configured on the relay.",
      });
    }

    const clientKey =
      req.headers["x-read-api-key"] || req.headers["x-read-api-token"] || "";
    if (!clientKey || clientKey !== READ_API_KEY) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized: missing or invalid x-read-api-key.",
      });
    }

    const body = req.body || {};
    const { query } = body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        ok: false,
        error: '"query" (string) is required',
      });
    }

    if (!AGENT_20_URL) {
      return res.status(500).json({
        ok: false,
        error: "AGENT_20_URL is not configured; cannot proxy brain read.",
      });
    }

    const targetBase = AGENT_20_URL.replace(/\/+$/, "");
    const url = `${targetBase}/brain-read`;

    const { data } = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        "x-read-api-key": READ_API_KEY,
      },
    });

    // Expect backend to already return { ok, ... }
    return res.status(200).json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    console.error(
      "Brain read proxy error:",
      err.response?.data || err.message
    );
    return res.status(status).json({
      ok: false,
      error: err.message || "Brain read proxy failed",
    });
  }
});


// ——— HEALTHCHECK ENDPOINT ——— //
app.get("/keepalive", (_req, res) => {
  res.status(200).send("I'm alive");
});

// ——— START SERVER ——— //
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
