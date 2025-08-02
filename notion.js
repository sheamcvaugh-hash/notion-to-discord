const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_SECRET });

let lastTimestamp = null;

async function fetchNewEntries() {
  const dbId = process.env.NOTION_DATABASE_ID;

  const response = await notion.databases.query({
    database_id: dbId,
    sorts: [{ property: "Timestamp", direction: "descending" }],
    page_size: 10,
  });

  const newEntries = [];
  let highestTimestamp = lastTimestamp;

  for (const result of response.results) {
    const props = result.properties;
    const timestamp = props.Timestamp?.date?.start;

    if (!timestamp) continue;

    if (lastTimestamp && timestamp <= lastTimestamp) continue;

    // Update the highest timestamp seen
    if (!highestTimestamp || timestamp > highestTimestamp) {
      highestTimestamp = timestamp;
    }

    const titleProp = Object.values(props).find((p) => p.type === "title");
    const rawInputProp = props["Raw Input"] || props["content"];

    newEntries.push({
      title: titleProp?.title?.[0]?.plain_text || "Untitled",
      rawText: rawInputProp?.rich_text?.[0]?.plain_text || "",
      Type: props.Type?.select?.name || null,
      Tags: props.Tags?.multi_select?.map((tag) => tag.name) || [],
      Confidence: props.Confidence?.select?.name || null,
      confidenceNotes: props.confidenceNotes?.rich_text?.[0]?.plain_text || "",
      Source: props.Source?.select?.name || null,
      Timestamp: timestamp,
    });
  }

  // Set lastTimestamp to the latest we've seen, not just the first result
  if (highestTimestamp) {
    lastTimestamp = highestTimestamp;
  }

  return newEntries.reverse(); // oldest first
}

module.exports = { fetchNewEntries };
