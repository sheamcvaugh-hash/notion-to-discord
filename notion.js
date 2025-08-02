const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_SECRET });

const { loadSentIds, saveSentIds } = require("./sentCache");

let sentIds = loadSentIds();

async function fetchNewEntries() {
  const dbId = process.env.NOTION_DATABASE_ID;

  const response = await notion.databases.query({
    database_id: dbId,
    sorts: [{ property: "Timestamp", direction: "descending" }],
    page_size: 50,
  });

  const newEntries = [];

  for (const result of response.results) {
    const id = result.id;
    const props = result.properties;
    const timestamp = props.Timestamp?.date?.start;

    if (!timestamp || sentIds.has(id)) continue;

    console.log(`[🆕] New entry found: ${id}`);

    // Dynamically find the title column
    const titleProp = Object.values(props).find((p) => p.type === "title");
    const rawInputProp = props["Raw Input"] || props["content"];

    newEntries.push({
      id,
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

  // Update the sent cache with newly sent IDs
  for (const entry of newEntries) {
    sentIds.add(entry.id);
  }

  if (newEntries.length > 0) {
    saveSentIds(sentIds);
    console.log(`[💾] Cache updated with ${newEntries.length} new IDs`);
  }

  return newEntries.reverse(); // Oldest first
}

module.exports = { fetchNewEntries };
