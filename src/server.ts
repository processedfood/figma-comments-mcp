#!/usr/bin/env node
// Phase 1 entry point: local stdio server using a personal Figma token.
// This is the only file that knows it's running locally.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FigmaClient } from "./core/figma.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error(
      "FIGMA_TOKEN is not set. Create a personal access token at figma.com → Settings → Security with the File comments (read) scope.",
    );
    process.exit(1);
  }

  const server = new McpServer({
    name: "figma-comments-mcp",
    title: "Figma Comments MCP",
    version: "0.2.0",
  });
  registerTools(server, { client: new FigmaClient(token) });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
