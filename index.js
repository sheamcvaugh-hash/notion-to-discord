const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

app.post("/notion-webhook", async (req, res) => {
  const data = req.body;
  const { title, content, type } = data;

  const webhookURL = type === "personal"
    ? process.env.DISCORD_WEBHOOK_PERSONAL
    : process.env.DISCORD_WEBHOOK_GLOBAL;

  try {
    await axios.post(webhookURL, {
      content: `**${title}**\n${content}`
    });

    res.status(200).send("Posted to Discord.");
  } catch (err) {
    console.error("Error posting to Discord:", err.message);
    res.status(500).send("Failed to post to Discord.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
