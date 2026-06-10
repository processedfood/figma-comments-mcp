import type { CommentThread, PageInfo } from "./figma.js";

/**
 * Threads on a given page, matched by page name (case-insensitive) or page id.
 * Accepts "1-2" style ids from URLs as well as the API's "1:2" form.
 */
export function filterByPage(
  threads: CommentThread[],
  page: string,
  pages: PageInfo[],
): { threads: CommentThread[]; matched: PageInfo | null } {
  const wanted = page.trim().toLowerCase();
  const wantedId = wanted.replace("-", ":");
  const matched =
    pages.find((p) => p.id === wantedId) ??
    pages.find((p) => p.name.toLowerCase() === wanted) ??
    pages.find((p) => p.name.toLowerCase().includes(wanted)) ??
    null;
  if (!matched) return { threads: [], matched: null };
  return { threads: threads.filter((t) => t.pageId === matched.id), matched };
}

export function filterUnresolved(threads: CommentThread[]): CommentThread[] {
  return threads.filter((t) => !t.resolved);
}

/** Threads where any message @mentions the given handle (case-insensitive). */
export function filterMentions(
  threads: CommentThread[],
  handle: string,
): CommentThread[] {
  const target = handle.toLowerCase();
  return threads.filter((t) =>
    t.mentions.some(
      (m) =>
        m.toLowerCase() === target ||
        m.toLowerCase().startsWith(target) ||
        target.startsWith(m.toLowerCase()),
    ),
  );
}

/** Threads with activity within the past N hours. */
export function filterRecent(threads: CommentThread[], hours: number): CommentThread[] {
  const cutoff = Date.now() - hours * 3_600_000;
  return threads.filter((t) => Date.parse(t.lastActivityAt) > cutoff);
}
