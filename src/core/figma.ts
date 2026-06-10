// Transport-agnostic Figma API client and comment threading.
// Phase-2 rule: no process.env, no filesystem, no stdio in this file.

export interface FigmaUser {
  id: string;
  handle: string;
  img_url?: string;
  email?: string;
}

export interface FigmaComment {
  id: string;
  parent_id: string;
  message: string;
  user: FigmaUser;
  created_at: string;
  resolved_at: string | null;
  client_meta: {
    node_id?: string;
    node_offset?: { x: number; y: number };
    x?: number;
    y?: number;
  } | null;
  order_id?: string | null;
}

export interface ThreadReply {
  id: string;
  author: string;
  message: string;
  createdAt: string;
}

export interface PageInfo {
  id: string;
  name: string;
}

export interface CommentThread {
  id: string;
  /** Canvas element the thread is pinned to, or "canvas" when pinned to empty space. */
  elementId: string;
  /** Page the anchored element lives on, when resolvable. */
  pageId?: string;
  pageName?: string;
  author: string;
  message: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  replies: ThreadReply[];
  /** Author of the most recent message in the thread. */
  lastSpeaker: string;
  /** Timestamp of the most recent message in the thread. */
  lastActivityAt: string;
  /** Distinct handles that wrote in this thread. */
  participants: string[];
  /** Handles that appear @mentioned anywhere in the thread. */
  mentions: string[];
  ageDays: number;
  deepLink: string;
}

export interface ElementGroup {
  elementId: string;
  threads: CommentThread[];
}

const FIGMA_API = "https://api.figma.com";

export class FigmaApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "FigmaApiError";
  }
}

export class FigmaClient {
  private me: FigmaUser | null = null;

  constructor(private readonly token: string) {}

  private async request<T>(
    path: string,
    init?: { method: string; body: unknown },
  ): Promise<T> {
    const res = await fetch(`${FIGMA_API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "X-Figma-Token": this.token,
        ...(init ? { "Content-Type": "application/json" } : {}),
      },
      body: init ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const hint =
        res.status === 403
          ? "Check that FIGMA_TOKEN is valid and has the File comments scope (posting replies needs the write scope, reading needs read)."
          : res.status === 404
            ? "File not found. Check the link, and that your Figma account can open this file."
            : body.slice(0, 200);
      throw new FigmaApiError(res.status, `Figma API ${res.status} on ${path}. ${hint}`);
    }
    return (await res.json()) as T;
  }

  async getComments(fileKey: string): Promise<FigmaComment[]> {
    const data = await this.request<{ comments: FigmaComment[] }>(
      `/v1/files/${encodeURIComponent(fileKey)}/comments`,
    );
    return data.comments ?? [];
  }

  /** Post a reply to an existing comment thread. Needs the write scope. */
  async postReply(
    fileKey: string,
    commentId: string,
    message: string,
  ): Promise<FigmaComment> {
    return this.request<FigmaComment>(
      `/v1/files/${encodeURIComponent(fileKey)}/comments`,
      { method: "POST", body: { message, comment_id: commentId } },
    );
  }

  async getMe(): Promise<FigmaUser> {
    if (!this.me) {
      this.me = await this.request<FigmaUser>("/v1/me");
    }
    return this.me;
  }

  /**
   * Pages in the file, plus a map from node id → page for every node visible
   * at depth 2 (pages and their top-level children, which is where Figma
   * anchors comments). Comments on nodes deeper than that fall back to no page.
   */
  async getPageMap(fileKey: string): Promise<{
    pages: PageInfo[];
    nodeToPage: Map<string, PageInfo>;
  }> {
    type Node = { id: string; name: string; type: string; children?: Node[] };
    const data = await this.request<{ document: Node }>(
      `/v1/files/${encodeURIComponent(fileKey)}?depth=2`,
    );
    const pages: PageInfo[] = [];
    const nodeToPage = new Map<string, PageInfo>();
    for (const canvas of data.document.children ?? []) {
      if (canvas.type !== "CANVAS") continue;
      const page = { id: canvas.id, name: canvas.name };
      pages.push(page);
      nodeToPage.set(canvas.id, page);
      for (const child of canvas.children ?? []) {
        nodeToPage.set(child.id, page);
      }
    }
    return { pages, nodeToPage };
  }
}

/** Accepts a full figma.com URL or a bare file key. */
export function parseFileKey(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(
    /figma\.com\/(?:design|file|board|proto)\/([A-Za-z0-9]+)/,
  );
  if (match) return match[1];
  if (/^[A-Za-z0-9]{10,}$/.test(trimmed)) return trimmed;
  throw new Error(
    `Could not find a Figma file key in "${input}". Pass a figma.com link or the file key itself.`,
  );
}

function extractMentions(message: string): string[] {
  // Figma's REST API renders mentions as plain "@Name" text. Names can
  // contain spaces, so capture up to a word boundary conservatively.
  const out: string[] = [];
  const re = /@([\p{L}\p{N}][\p{L}\p{N} ._-]*?)(?=[,.!?:;)]|\s{2}|$|\n)/gmu;
  for (const m of message.matchAll(re)) out.push(m[1].trim());
  return out;
}

export function buildThreads(
  comments: FigmaComment[],
  fileKey: string,
  nodeToPage?: Map<string, PageInfo>,
): CommentThread[] {
  const roots = comments.filter((c) => !c.parent_id);
  const byParent = new Map<string, FigmaComment[]>();
  for (const c of comments) {
    if (!c.parent_id) continue;
    const list = byParent.get(c.parent_id) ?? [];
    list.push(c);
    byParent.set(c.parent_id, list);
  }

  const now = Date.now();
  return roots
    .map((root) => {
      const replies = (byParent.get(root.id) ?? []).sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
      );
      const all = [root, ...replies];
      const last = all[all.length - 1];
      const participants = [...new Set(all.map((c) => c.user.handle))];
      const mentions = [...new Set(all.flatMap((c) => extractMentions(c.message)))];
      const page = root.client_meta?.node_id
        ? nodeToPage?.get(root.client_meta.node_id)
        : undefined;
      return {
        id: root.id,
        elementId: root.client_meta?.node_id ?? "canvas",
        pageId: page?.id,
        pageName: page?.name,
        author: root.user.handle,
        message: root.message,
        createdAt: root.created_at,
        resolved: root.resolved_at != null,
        resolvedAt: root.resolved_at,
        replies: replies.map((r) => ({
          id: r.id,
          author: r.user.handle,
          message: r.message,
          createdAt: r.created_at,
        })),
        lastSpeaker: last.user.handle,
        lastActivityAt: last.created_at,
        participants,
        mentions,
        ageDays: Math.floor((now - Date.parse(root.created_at)) / 86_400_000),
        deepLink: `https://www.figma.com/design/${fileKey}?#${root.id}`,
      };
    })
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
}

export function groupByElement(threads: CommentThread[]): ElementGroup[] {
  const groups = new Map<string, CommentThread[]>();
  for (const t of threads) {
    const list = groups.get(t.elementId) ?? [];
    list.push(t);
    groups.set(t.elementId, list);
  }
  return [...groups.entries()].map(([elementId, ts]) => ({ elementId, threads: ts }));
}
