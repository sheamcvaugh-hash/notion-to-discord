const { Client } = require("@notionhq/client");
const { loadSentIds, saveSentIds } = require("./sentCache");

const notion = new Client({ auth: process.env.NOTION_SECRET });
let sentIds = loadSentIds();

async function fetchNewEntries() {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId) throw new Error("❌ Missing NOTION_DATABASE_ID in environment");

  let response;
  try {
    response = await notion.databases.query({
      database_id: dbId,
      sorts: [{ property: "Timestamp", direction: "descending" }],
      page_size: 50,
    });
  } catch (err) {
    console.error("❌ Failed to query Notion database:", err.message);
    return [];
  }

  const newEntries = [];

  for (const result of response.results) {
    const id = result.id;
    const props = result.properties;

    // Skip if already sent or missing timestamp
    const timestamp = props?.Timestamp?.date?.start;
    if (!timestamp || sentIds.has(id)) continue;

    console.log(`[🆕] New entry found: ${id}`);

    // Dynamically resolve title property
    const titleProp = Object.values(props).find(p => p.type === "title");
    const rawInputProp = props["Raw Input"] || props["content"];

    // Defensive parsing
    const title = titleProp?.title?.[0]?.plain_text?.trim() || "Untitled";
    const rawText = rawInputProp?.rich_text?.[0]?.plain_text?.trim() || "";
    const type = props.Type?.select?.name || null;

    const tags = Array.isArray(props.Tags?.multi_select)
      ? props.Tags.multi_select.map(tag => tag.name)
      : [];

    const confidence = props.Confidence?.select?.name || null;
    const confidenceNotes = props.confidenceNotes?.rich_text?.[0]?.plain_text?.trim() || "";
    const source = props.Source?.select?.name || null;

    newEntries.push({
      id,
      title,
      rawText,
      Type: type,
      Tags: tags,
      Confidence: confidence,
      confidenceNotes,
      Source: source,
      Timestamp: timestamp,
    });
  }

  if (newEntries.length > 0) {
    newEntries.forEach(e => sentIds.add(e.id));
    saveSentIds(sentIds);
    console.log(`[💾] Cache updated with ${newEntries.length} new ID${newEntries.length > 1 ? "s" : ""}`);
  }

  return newEntries.reverse(); // Oldest first
}

module.exports = { fetchNewEntries };
