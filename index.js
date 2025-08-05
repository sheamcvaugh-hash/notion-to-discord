// ——— DEPENDENCIES & SETUP ——— //
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const { fetchNewEntries } = require("./notion");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// ====== SUPABASE CLIENT INITIALIZATION ====== //
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY // Must match the secret in Fly!
);

// ——— UTILITY FUNCTIONS ——— //
function buildMessage(entry) {
  const {
    title,
    rawText,
    Type,
    Tags,
    Confidence,
    confidenceNotes,
    Source,
    Timestamp,
  } = entry;

  const formattedTags = Array.isArray(Tags)
    ? Tags.map((tag) => `#${tag}`).join(" ")
    : "";

  let messageContent = `🧠 **New Digital Brain Entry Logged**

**📝 Title:** ${title || "Untitled"}
**🗂 Type:** ${Type || "Uncategorized"}  
**🏷 Tags:** ${formattedTags}  
**📈 Confidence:** ${Confidence || "Unknown"}`;

  if (confidenceNotes) {
    messageContent += `  
**🧾 Confidence Notes:** ${confidenceNotes}`;
  }

  messageContent += `  
**📤 Source:** ${Source || "Unknown"}  
**🕒 Timestamp:** ${Timestamp || "No timestamp"}

**🧾 Raw Input:**  
${rawText || "No raw input provided."}`;

  return { content: messageContent };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ——— MANUAL POST TEST ROUTE ——— //
app.post("/", async (req, res) => {
  const messagePayload = buildMessage(req.body);

  try {
    await Promise.all([
      axios.post(process.env.DISCORD_WEBHOOK_GLOBAL, messagePayload),
      axios.post(process.env.DISCORD_WEBHOOK_PERSONAL, messagePayload),
    ]);
    res.status(200).send("✅ Message sent to both Discord channels");
  } catch (error) {
    console.error("❌ Error posting to Discord:", error.response?.data || error.message);
    res.status(500).send("Failed to post to Discord");
  }
});

// ——— AGENT 20 POST ENDPOINT ——— //
app.post("/agent20", async (req, res) => {
  const {
    brain,
    type,
    summary,
    message,
    tags,
    source,
    raw_text,
    metadata,
    route
  } = req.body;

  // Construct fallback message if one wasn't provided
  const msgContent = message || `🧠 New entry logged in ${brain || 'Digital Brain'}\n\n**Type:** ${type || 'Uncategorized'}\n**Summary:** ${summary || 'No summary provided'}`;

  const payload = {
    content: msgContent,
  };

  // Always send to logs-global; optionally add route-based targets
  const webhookTargets = [process.env.DISCORD_WEBHOOK_GLOBAL];

  if (Array.isArray(route)) {
    for (const target of route) {
      const envKey = `DISCORD_WEBHOOK_${target.toUpperCase()}`;
      const url = process.env[envKey];
      if (url && !webhookTargets.includes(url)) webhookTargets.push(url);
    }
  }

  try {
    await Promise.all(
      webhookTargets.map((url) => axios.post(url, payload))
    );
    res.status(200).json({ message: "✅ Discord notification sent" });
  } catch (err) {
    console.error("❌ Discord relay error:", err.message);
    res.status(500).json({ error: "Failed to send to Discord" });
  }
});

// ——— NOTION → DISCORD POLLING ——— //
setInterval(async () => {
  console.log("🔁 Checking Notion for new entries...");

  try {
    const newEntries = await fetchNewEntries();

    if (!newEntries || !Array.isArray(newEntries)) {
      console.error("❌ fetchNewEntries() returned invalid response:", newEntries);
      return;
    }

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const recentEntries = newEntries.filter((entry) => {
      const ts = new Date(entry.Timestamp);
      return ts >= fiveMinutesAgo;
    });

    console.log(`📥 Found ${newEntries.length} new entr${newEntries.length === 1 ? "y" : "ies"}`);
    console.log(`📤 ${recentEntries.length} entr${recentEntries.length === 1 ? "y" : "ies"} will be sent to Discord`);

    for (const entry of recentEntries) {
      const messagePayload = buildMessage(entry);

      try {
        await axios.post(process.env.DISCORD_WEBHOOK_GLOBAL, messagePayload);
        await sleep(300);
        await axios.post(process.env.DISCORD_WEBHOOK_PERSONAL, messagePayload);
        await sleep(300);
        console.log(`✅ Sent to Discord: ${entry.title || "[Untitled]"}`);
      } catch (err) {
        console.error("❌ Discord send error:", err.response?.data || err.message);
      }
    }
  } catch (err) {
    console.error("❌ Notion polling failed:", err.message);
  }
}, 60000);

// ——— HEALTHCHECK ENDPOINT ——— //
app.get("/keepalive", (req, res) => {
  res.status(200).send("👋 I'm alive");
});

// ——— START SERVER ——— //
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
