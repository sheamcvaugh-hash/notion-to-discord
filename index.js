const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { fetchNewEntries } = require("./notion");

const app = express();
const port = process.env.PORT || 3000;

let hasRunOnce = false;

app.use(bodyParser.json());

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

// Optional: still allow manual POST
app.post("/", async (req, res) => {
  const messagePayload = buildMessage(req.body);

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

// ✅ Poll Notion and send new entries directly
setInterval(async () => {
  console.log("🔁 Checking Notion for new entries...");
  const newEntries = await fetchNewEntries();

  if (!hasRunOnce) {
    console.log("⏭️ First run — skipping Discord sends");
    hasRunOnce = true;
    return;
  }

  for (const entry of newEntries) {
    const messagePayload = buildMessage(entry);
    try {
      await axios.post(process.env.DISCORD_WEBHOOK_GLOBAL, messagePayload);
      await sleep(300); // Rate limit buffer
      await axios.post(process.env.DISCORD_WEBHOOK_PERSONAL, messagePayload);
      await sleep(300); // Additional buffer
      console.log("✅ Sent new entry to Discord");
    } catch (err) {
      console.error("❌ Error sending to Discord:", err.message);
    }
  }
}, 60000);

// Keepalive route
app.get("/keepalive", (req, res) => {
  res.status(200).send("👋 I'm alive");
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
