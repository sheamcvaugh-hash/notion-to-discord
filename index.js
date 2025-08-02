const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

app.post("/", async (req, res) => {
  const { title, content, type } = req.body;

  console.log("Incoming payload:", { title, content, type });

  const message = {
    embeds: [
      {
        title: title || "Untitled",
        description: content || "No content provided",
        color: type === "personal" ? 0x3498db : 0x2ecc71, // blue vs green
      },
    ],
  };

  try {
    if (type === "personal") {
      await axios.post(process.env.DISCORD_WEBHOOK_PERSONAL, message);
    } else {
      await axios.post(process.env.DISCORD_WEBHOOK_GLOBAL, message);
    }
    res.status(200).send("Message sent to Discord");
  } catch (error) {
    console.error("Error posting to Discord:", error.response?.data || error.message);
    res.status(500).send("Failed to post to Discord");
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
