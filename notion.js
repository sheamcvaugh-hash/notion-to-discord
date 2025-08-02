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
    if (!timestamp || timestamp === lastTimestamp) break;

    lastTimestamp = timestamp;

    entries.push({
      title: props.title?.title[0]?.plain_text || "Untitled",
      rawText: props.content?.rich_text[0]?.plain_text || "",
      Type: props.Type?.select?.name,
      Tags: props.Tags?.multi_select?.map((tag) => tag.name),
      Confidence: props.Confidence?.select?.name,
      confidenceNotes: props.confidenceNotes?.rich_text[0]?.plain_text || "",
      Source: props.Source?.select?.name,
      Timestamp: timestamp,
    });
  }

  return entries;
}

module.exports = { fetchNewEntries };
