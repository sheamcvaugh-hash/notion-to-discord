const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { fetchNewEntries } = require("./notion");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// ✅ Keepalive route for cron job ping
app.get("/keepalive", (req, res) => {
  res.status(200).send("👋 I'm alive");
});

// 📥 Webhook route to receive and dispatch Notion entries to Discord
app.post("/", async (req, res) => {
  const {
    title,
    rawText,
    Type,
    Tags,
    Confidence,
    confidenceNotes,
    Source,
    Timestamp,
  } = req.body;

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

  const messagePayload = { content: messageContent };

  try {
    await Promise.a
