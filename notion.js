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
  let newestSeen = null;

  for (const result of response.results) {
    const props = result.properties;
    const timestampStr = props.Timestamp?.date?.start;

    if (!timestampStr) continue;

    const entryTime = new Date(timestampStr);

    // Diagnostic logging
    if (lastTimestamp) {
      console.log(`[⏱] Comparing entry: ${entryTime.toISOString()} > ${lastTimestamp.toISOString()} ?`);
    } else {
      console.log(`[⏱] First run. Accepting entry: ${entryTime.toISOString()}`);
    }

    if (lastTimestamp && entryTime <= lastTimestamp) continue;

    if (!newestSeen || entryTime > newestSeen) {
      newestSeen = entryTime;
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
      Timestamp: timestampStr,
    });
  }

  if (newestSeen) {
    lastTimestamp = newestSeen;
    console.log(`[✅] Updated lastTimestamp to ${lastTimestamp.toISOString()}`);
  }

  return newEntries.reverse(); // Oldest first
}

module.exports = { fetchNewEntries };
