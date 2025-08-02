const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { fetchNewEntries } = require("./notion");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

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
    await Promise.all([
      axios.post(process.env.DISCORD_WEBHOOK_GLOBAL, messagePayload),
      axios.post(process.env.DISCORD_WEBHOOK_PERSONAL, messagePayload),
    ]);
    res.status(200).send("Message sent to both Discord channels");
  } catch (error) {
    console.error(
      "Error posting to Discord:",
      error.response?.data || error.message
    );
    res.status(500).send("Failed to post to Discord");
  }
});

setInterval(async () => {
  console.log("Checking Notion for new entries...");
  const newEntries = await fetchNewEntries();

  for (const entry of newEntries) {
    try {
      await axios.post(`http://localhost:${port}/`, entry);
      console.log("Dispatched new entry to internal POST /");
    } catch (err) {
      console.error("Error sending to internal route:", err.message);
    }
  }
}, 60000);

// Keepalive route to prevent autosuspend
app.get("/keepalive", (req, res) => {
  res.status(200).send("👋 I'm alive");
});

// ✅ CRITICAL: Listen on 0.0.0.0 so Fly can reach the app
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
