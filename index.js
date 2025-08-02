const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

app.post("/notion-webhook", async (req, res) => {
  const data = req.body;
  const { title, content, type } = data;

  console.log("Incoming payload:", JSON.stringify(data, null, 2));

  const webhooks = [
    process.env.DISCORD_WEBHOOK_PERSONAL,
    process.env.DISCORD_WEBHOOK_GLOBAL
  ];

  try {
    for (const webhook of webhooks) {
      if (!webhook) {
        console.error("Missing webhook URL in environment variables.");
        continue;
      }

      const discordPayload = {
        content: `**${title}**\n${content}\n\n_Type:_ ${type}`
      };

      const response = await axios.post(webhook, discordPayload);
      console.log(`Posted to Discord: ${response.status}`);
    }

    res.status(200).send("Posted to both Discord channels.");
  } catch (err) {
    console.error("Error posting to Discord:", err.response?.data || err.message);
    res.status(500).send("Failed to post to Discord.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
