// MCP tool definitions, transport-agnostic. The Figma client is injected so
// the same tools can run locally (stdio + token env) or hosted
// (HTTP + OAuth) in phase 2.
//
// Output is a compact text format, not JSON: resolved threads collapse to a
// count, messages are capped, and thread volume is limited by max_threads.
// This keeps the context cost of each fetch low for the triage skill.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  FigmaClient,
  buildThreads,
  parseFileKey,
  type CommentThread,
} from "./core/figma.js";
import {
  filterByPage,
  filterMentions,
  filterRecent,
  filterUnresolved,
} from "./core/filters.js";

const TRIAGE_HINT =
  "To sort these into needs-decision / open questions / waiting-for / owners, use the figma-comment-triage skill.";

const MESSAGE_CAP = 300;
const DEFAULT_MAX_THREADS = 50;

const sharedArgs = {
  url: z
    .string()
    .describe("A figma.com file link (design/file URL) or a bare file key"),
  page: z
    .string()
    .optional()
    .describe(
      "Optional: limit to one page, by page name (e.g. \"Homepage\") or page id (e.g. \"1:2\" or \"1-2\")",
    ),
  max_threads: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_MAX_THREADS)
    .describe(
      `Cap on unresolved threads shown, newest first (default ${DEFAULT_MAX_THREADS})`,
    ),
};

interface Deps {
  client: FigmaClient;
}

function truncate(message: string): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > MESSAGE_CAP
    ? `${flat.slice(0, MESSAGE_CAP)}… (truncated)`
    : flat;
}

function ageLabel(days: number): string {
  return days === 0 ? "today" : `${days}d ago`;
}

function present(
  threads: CommentThread[],
  label: string,
  fileKey: string,
  maxThreads: number,
): { content: { type: "text"; text: string }[] } {
  if (threads.length === 0) {
    return {
      content: [{ type: "text", text: `No comments matched filter "${label}".` }],
    };
  }

  const unresolved = threads.filter((t) => !t.resolved);
  const resolvedCount = threads.length - unresolved.length;
  const shown = unresolved.slice(0, maxThreads); // already sorted newest-first
  const omitted = unresolved.length - shown.length;

  const lines: string[] = [
    `Figma comments — ${label}`,
    `file: ${fileKey} · ${threads.length} threads (${unresolved.length} unresolved, ${resolvedCount} resolved)`,
    `deep link per thread: https://www.figma.com/design/${fileKey}?#<thread-id>`,
  ];

  // page → element → threads, preserving newest-first order within groups
  const byPage = new Map<string, Map<string, CommentThread[]>>();
  for (const t of shown) {
    const pageKey = t.pageName ?? "(page unknown)";
    const elements = byPage.get(pageKey) ?? new Map<string, CommentThread[]>();
    const list = elements.get(t.elementId) ?? [];
    list.push(t);
    elements.set(t.elementId, list);
    byPage.set(pageKey, elements);
  }

  for (const [pageName, elements] of byPage) {
    lines.push("", `page: ${pageName}`);
    for (const [elementId, elementThreads] of elements) {
      lines.push(`  element ${elementId}:`);
      for (const t of elementThreads) {
        const replyNote =
          t.replies.length === 0
            ? " · no replies"
            : ` · ${t.replies.length} ${t.replies.length === 1 ? "reply" : "replies"}`;
        lines.push(`  [${t.id}] ${ageLabel(t.ageDays)}${replyNote}`);
        lines.push(`    ${t.author}: ${truncate(t.message)}`);
        for (const r of t.replies) {
          lines.push(`    ${r.author}: ${truncate(r.message)}`);
        }
      }
    }
  }

  lines.push("");
  if (resolvedCount > 0) {
    lines.push(
      `${resolvedCount} resolved ${resolvedCount === 1 ? "thread" : "threads"} collapsed (count only, not shown).`,
    );
  }
  if (omitted > 0) {
    lines.push(
      `Showing newest ${shown.length} of ${unresolved.length} unresolved threads; ${omitted} omitted. Narrow with the page argument, get_recent_comments, or raise max_threads.`,
    );
  }
  lines.push(TRIAGE_HINT);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/**
 * Fetch all threads for a file, annotated with page names, optionally
 * narrowed to one page. Throws a friendly error listing the file's pages
 * when the requested page doesn't match.
 */
async function fetchThreads(
  deps: Deps,
  url: string,
  page?: string,
): Promise<{ fileKey: string; threads: CommentThread[]; pageSuffix: string }> {
  const fileKey = parseFileKey(url);
  const [comments, pageMap] = await Promise.all([
    deps.client.getComments(fileKey),
    deps.client.getPageMap(fileKey).catch(() => null),
  ]);
  const threads = buildThreads(comments, fileKey, pageMap?.nodeToPage);
  if (!page) return { fileKey, threads, pageSuffix: "" };
  if (!pageMap) {
    throw new Error(
      "Could not load the file's page structure, so page filtering is unavailable for this file right now.",
    );
  }
  const { threads: filtered, matched } = filterByPage(threads, page, pageMap.pages);
  if (!matched) {
    const available = pageMap.pages.map((p) => `"${p.name}" (${p.id})`).join(", ");
    throw new Error(`No page matching "${page}". This file's pages: ${available}.`);
  }
  return { fileKey, threads: filtered, pageSuffix: ` on page "${matched.name}"` };
}

export function registerTools(server: McpServer, deps: Deps): void {
  server.registerTool(
    "get_all_comments",
    {
      title: "Get all comments",
      description:
        "Fetch every comment thread in a Figma file, grouped by page and the canvas element each thread is pinned to. Resolved threads are returned as a count only. Prefer a narrower tool (unresolved/recent/mentions, or the page argument) when it answers the question.",
      inputSchema: sharedArgs,
    },
    async ({ url, page, max_threads }) => {
      const { fileKey, threads, pageSuffix } = await fetchThreads(deps, url, page);
      return present(threads, `all${pageSuffix}`, fileKey, max_threads);
    },
  );

  server.registerTool(
    "get_unresolved_comments",
    {
      title: "Get unresolved comments",
      description: "Comment threads not yet marked resolved in Figma.",
      inputSchema: sharedArgs,
    },
    async ({ url, page, max_threads }) => {
      const { fileKey, threads, pageSuffix } = await fetchThreads(deps, url, page);
      return present(
        filterUnresolved(threads),
        `unresolved${pageSuffix}`,
        fileKey,
        max_threads,
      );
    },
  );

  server.registerTool(
    "get_comments_mentioning_me",
    {
      title: "Get comments mentioning me",
      description:
        "Comment threads where the owner of the Figma token is @mentioned.",
      inputSchema: sharedArgs,
    },
    async ({ url, page, max_threads }) => {
      const me = await deps.client.getMe();
      const { fileKey, threads, pageSuffix } = await fetchThreads(deps, url, page);
      return present(
        filterMentions(threads, me.handle),
        `mentioning @${me.handle}${pageSuffix}`,
        fileKey,
        max_threads,
      );
    },
  );

  server.registerTool(
    "get_recent_comments",
    {
      title: "Get recent comments",
      description:
        "Comment threads with activity in the past N hours (default 24).",
      inputSchema: {
        ...sharedArgs,
        hours: z
          .number()
          .positive()
          .max(24 * 90)
          .default(24)
          .describe("Look-back window in hours, default 24"),
      },
    },
    async ({ url, page, max_threads, hours }) => {
      const { fileKey, threads, pageSuffix } = await fetchThreads(deps, url, page);
      return present(
        filterRecent(threads, hours),
        `past ${hours}h${pageSuffix}`,
        fileKey,
        max_threads,
      );
    },
  );
}
