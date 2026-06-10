// Quick manual check against a real file, bypassing MCP:
//   FIGMA_TOKEN=xxx npm run probe -- <figma-url>
import { FigmaClient, buildThreads, groupByElement, parseFileKey } from "./core/figma.js";

const url = process.argv[2];
const token = process.env.FIGMA_TOKEN;
if (!url || !token) {
  console.error("Usage: FIGMA_TOKEN=xxx npm run probe -- <figma-url>");
  process.exit(1);
}

const fileKey = parseFileKey(url);
const client = new FigmaClient(token);
const me = await client.getMe();
const threads = buildThreads(await client.getComments(fileKey), fileKey);
console.log(`Token owner: @${me.handle}`);
console.log(`Threads: ${threads.length}, unresolved: ${threads.filter((t) => !t.resolved).length}`);
console.log(JSON.stringify(groupByElement(threads), null, 2));
