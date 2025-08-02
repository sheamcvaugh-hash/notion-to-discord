const axios = require("axios");
const { fetchNewEntries } = require("./notion");

const port = process.env.PORT || 3000;

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
