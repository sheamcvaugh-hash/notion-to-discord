const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const { fetchNewEntries } = require("./notion");

const app = express();
const port = process.env.PORT || 3000;
let hasRunOnce = false;

app.use(bodyParser.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// 🧠 Build Discord message from Notion poll
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

// ✅ Manual POST for Discord
app.post("/", async (req, res) => {
  const messagePayload = buildMessage(req.body);

  try {
    await Promise.all([
      axios.post(process.env.DISCORD_WEBHOOK_GLOBAL, messagePayload),
      axios.post(process.env.DISCORD_WEBHOOK_PERSONAL, messagePayload),
    ]);
    res.status(200).send("Message sent to both Discord channels");
  } catch (error) {
    console.error("Error posting to Discord:", error.response?.data || error.message);
    res.status(500).send("Failed to post to Discord");
  }
});

// ✅ Supabase bridge for Agent 20
app.post("/agent20", async (req, res) => {
  const { raw_text, source, tags, metadata } = req.body;

  if (!raw_text || !source) {
    return res.status(400).json({ error: "Missing required fields: raw_text, source" });
  }

  let summary = null;

  try {
    const openaiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a thoughtful assistant. Summarize the user's input into a concise, helpful log entry.",
          },
          {
            role: "user",
            content: raw_text,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    summary = openaiRes.data.choices[0].message.content.trim();
  } catch (error) {
    console.warn("⚠️ Failed to summarize with OpenAI:", error.message);
  }

  try {
    const { error: supabaseError } = await supabase.from("agent20_queue").insert([
      {
        raw_text,
        source,
        status: "Pending",
        summary,
        tags,
        metadata,
      },
    ]);

    if (supabaseError) {
      throw supabaseError;
    }

    res.status(200).json({ message: "✅ Data inserted into Supabase", summary });
  } catch (err) {
    console.error("❌ Supabase insert error:", err.message);
    res.status(500).json({ error: "Failed to insert into Supabase" });
  }
});

// ♻️ Poll Notion and send entries to Discord
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
      await sleep(300);
      await axios.post(process.env.DISCORD_WEBHOOK_PERSONAL, messagePayload);
      await sleep(300);
      console.log("✅ Sent new entry to Discord");
    } catch (err) {
      console.error("❌ Error sending to Discord:", err.message);
    }
  }
}, 60000);

// 👋 Healthcheck
app.get("/keepalive", (req, res) => {
  res.status(200).send("👋 I'm alive");
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
