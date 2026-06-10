#!/usr/bin/env node
// Phase 1 entry point: local stdio server using a personal Figma token.
// This is the only file that knows it's running locally.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FigmaClient } from "./core/figma.js";
import { registerTools } from "./tools.js";

const TOKEN_FILE = join(homedir(), ".figma-comments-mcp.env");

/** FIGMA_TOKEN env var wins; otherwise read it from ~/.figma-comments-mcp.env */
function readToken(): string | null {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN;
  try {
    const text = readFileSync(TOKEN_FILE, "utf8");
    const match = text.match(/^\s*FIGMA_TOKEN\s*=\s*["']?([^"'\r\n]+)/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const token = readToken();
  if (!token) {
    console.error(
      [
        "No Figma token found.",
        "",
        "1. Create a personal access token at figma.com → Settings → Security",
        "   with the File comments scope.",
        `2. Save it in a file at ${TOKEN_FILE} containing one line:`,
        "   FIGMA_TOKEN=your-token-here",
        "",
        "(Setting a FIGMA_TOKEN environment variable also works.)",
      ].join("\n"),
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
