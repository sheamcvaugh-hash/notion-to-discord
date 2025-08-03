const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const { fetchNewEntries } = require("./notion");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// 🧠 Format Discord message
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

// ✅ Manual POST test
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

// ✅ Agent 20 input (from other apps)
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

    if (supabaseError) throw supabaseError;

    res.status(200).json({ message: "✅ Data inserted into Supabase", summary });
  } catch (err) {
    console.error("❌ Supabase insert error:", err.message);
    res.status(500).json({ error: "Failed to insert into Supabase" });
  }
});

// ♻️ Notion → Discord poll loop
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

// 👋 Healthcheck
app.get("/keepalive", (req, res) => {
  res.status(200).send("👋 I'm alive");
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
