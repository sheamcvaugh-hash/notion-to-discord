// ——— DEPENDENCIES & SETUP ——— //
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// ——— BASIC MESSAGE BUILDER ——— //
function buildMessage(entry) {
  // Pass through as-is, just stringifies JSON nicely for Discord.
  return { content: JSON.stringify(entry, null, 2) };
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

// ——— HEALTHCHECK ENDPOINT ——— //
app.get("/keepalive", (req, res) => {
  res.status(200).send("👋 I'm alive");
});

// ——— START SERVER ——— //
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
