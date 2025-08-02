const axios = require("axios");

const NOTION_SECRET = process.env.NOTION_SECRET;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// DEBUG: Log first 6 characters of secret to verify it's injected
console.log("NOTION_SECRET starts with:", NOTION_SECRET?.slice(0, 6));

let lastChecked = new Date().toISOString();

async function fetchNewEntries() {
  try {
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        filter: {
          timestamp: "created_time",
          created_time: {
            after: lastChecked,
          },
        },
        sorts: [
          {
            timestamp: "created_time",
            direction: "ascending",
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${NOTION_SECRET}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      }
    );

    const results = response.data.results || [];
    if (results.length > 0) {
      lastChecked = new Date().toISOString(); // advance cursor
    }

    return results.map(mapNotionPageToPayload);
  } catch (error) {
    console.error("❌ Failed to fetch Notion entries:", error.message);
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    return [];
  }
}

// ----------- Field Extractors -----------

function getPlainText(richTextArray) {
  if (!Array.isArray(richTextArray)) return "";
  return richTextArray.map((t) => t.plain_text).join(" ");
}

function getSelectValue(field) {
  return field?.select?.name || "";
}

function getMultiSelect(field) {
  return (field?.multi_select || []).map((t) => t.name);
}

function getDate(field) {
  return field?.date?.start || null;
}

// ----------- Mapper -----------

function mapNotionPageToPayload(page) {
  const props = page.properties;

  return {
    title: getPlainText(props["Core Brain Database"]?.title),
    rawText: getPlainText(props["Raw Input"]?.rich_text),
    Type: getSelectValue(props["Type"]),
    Tags: getMultiSelect(props["Tags"]),
    Confidence: getSelectValue(props["Confidence"]),
    confidenceNotes: getPlainText(props["Confidence Notes"]?.rich_text),
    Source: getSelectValue(props["Source"]),
    Timestamp: getDate(props["Timestamp"]) || page.created_time,
  };
}

module.exports = {
  fetchNewEntries,
};
