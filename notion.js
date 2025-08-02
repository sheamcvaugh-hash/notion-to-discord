const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_SECRET });

let lastTimestamp = null;

async function fetchNewEntries() {
  const dbId = process.env.NOTION_DATABASE_ID;

  const response = await notion.databases.query({
    database_id: dbId,
    sorts: [{ property: "Timestamp", direction: "descending" }],
    page_size: 5,
  });

  const entries = [];

  for (const result of response.results) {
    const props = result.properties;

    const timestamp = props.Timestamp?.date?.start;
    if (!timestamp || timestamp === lastTimestamp) continue;

    lastTimestamp = timestamp;

    // Dynamically find the title column (only one will be of type "title")
    const titleProp = Object.values(props).find(
      (p) => p.type === "title"
    );
    const rawInputProp = props["Raw Input"] || props["content"];

    entries.push({
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

  return entries;
}

module.exports = { fetchNewEntries };
