const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.resolve(__dirname, "sent.json");

function loadSentIds() {
  try {
    const data = fs.readFileSync(CACHE_FILE, "utf8");
    return new Set(JSON.parse(data));
  } catch (err) {
    return new Set(); // No cache yet
  }
}

function saveSentIds(sentIds) {
  const array = Array.from(sentIds);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(array, null, 2), "utf8");
}

module.exports = {
  loadSentIds,
  saveSentIds,
};

