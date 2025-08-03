const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.resolve(__dirname, "sent.json");

function loadSentIds() {
  try {
    const data = fs.readFileSync(CACHE_FILE, "utf8");
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) throw new Error("Cache file is not an array");
    return new Set(parsed);
  } catch (err) {
    console.warn("⚠️ Failed to load sent.json cache. Starting fresh.");
    return new Set();
  }
}

function saveSentIds(sentIds) {
  const array = Array.from(sentIds);
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(array, null, 2), "utf8");
  } catch (err) {
    console.error("❌ Failed to write sent.json cache:", err.message);
  }
}

module.exports = {
  loadSentIds,
  saveSentIds,
};
