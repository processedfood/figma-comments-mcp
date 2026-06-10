# Figma Comments MCP

An MCP server for Claude Code that fetches comments from any Figma file link, plus a triage skill that sorts them into what the team needs to do: decisions, open questions, who's waiting on whom, and who owns each to-do.

## Tools

| Tool | What it returns |
| --- | --- |
| `get_all_comments` | Every comment thread in the file |
| `get_unresolved_comments` | Threads not yet marked resolved in Figma |
| `get_comments_mentioning_me` | Threads where you are @mentioned (detected from your token, no config) |
| `get_recent_comments` | Threads with activity in the past 24 hours (or a custom `hours`) |
| `reply_to_comment` | Posts a reply to a thread (needs the write scope, see below) |

The fetch tools take a figma.com link (or bare file key) and return threads grouped by the canvas element each comment is pinned to, with authors, replies, @mentions, age, the page it sits on, and a deep link back to the comment in Figma.

Output is deliberately compact to keep Claude's context cost low: resolved threads come back as a count only, messages are capped at 300 characters, and at most `max_threads` unresolved threads (default 50, newest first) are shown, with a note on how to narrow further. Deep links are built from one pattern in the header rather than repeated per thread.

Every fetch tool also accepts three optional narrowing arguments. In Claude Code, just say it: "unresolved comments on the Homepage page of <link>", "what has Sarah commented?", "any comments about the pricing table?".

- `page` — one page only, by name ("Homepage") or id ("1:2" / "1-2"). If the name doesn't match, the error lists the file's pages. Figma's comments API itself is file-wide, so comments are anchored via the page's top-level frames; in rare cases a comment pinned to a deeply nested element may not resolve to a page and only appears in unfiltered results.
- `author` — threads where this person wrote a message (partial, case-insensitive).
- `search` — threads whose text contains a keyword (case-insensitive).

`reply_to_comment` lets Claude answer a thread for you ("reply 'on it' to that one"). It posts as the token owner and only works if your token has the **File comments (write)** scope; with a read-only token the fetch tools still work and only replying fails.

## Setup

1. **Figma token.** figma.com → Settings → Security → Personal access tokens. Create one with the **File comments** scope: read is enough for fetching, write if you also want `reply_to_comment`.

2. **Save the token.** Paste this in the terminal, replacing `your-token-here` with the token you copied:

   ```sh
   echo "FIGMA_TOKEN=your-token-here" > ~/.figma-comments-mcp.env
   ```

   That creates a small file in your home folder. The token stays on your machine and is only ever sent to Figma. When the token expires, repeat this step with a new one. (A `FIGMA_TOKEN` environment variable also works and takes precedence, if you prefer that.)

3. **Register with Claude Code.**

   ```sh
   claude mcp add figma-comments -- npx -y figma-comments-mcp
   ```

   Or, running from a clone of this repo:

   ```sh
   npm install
   npm run build
   claude mcp add figma-comments -- node /path/to/figma-comments-mcp/dist/server.js
   ```

4. **Use it.** In a Claude Code session:

   > Triage the comments in https://www.figma.com/design/abc123/My-File

## The triage skill

The server fetches and filters; the actual sorting intelligence lives in a skill, a markdown file at [`.claude/skills/figma-comment-triage/SKILL.md`](.claude/skills/figma-comment-triage/SKILL.md) that teaches Claude how to read the threads. It sorts every unresolved thread into four categories, in this order:

1. **Needs a decision** — explicit "should we A or B" threads, plus conflicts: because threads arrive grouped by canvas element, the skill compares takes on the same element and flags it when two people argue opposite directions, quoting both positions.
2. **Open questions** — unanswered questions, each with who it's waiting on (inferred from @mentions or who spoke last).
3. **Waiting for** — threads blocked on something promised or external, with what and how long.
4. **To-dos** — actionable requests with an inferred owner, marked **unassigned** when nobody has picked it up, so tasks don't silently fall to nobody.

Anything older than 7 days gets called out as stale, every item links back to the comment in Figma, and resolved threads are reported as one closing count line.

**To get it:** copy the `.claude/skills/figma-comment-triage` folder into your own project's `.claude/skills/` folder (the npm package ships only the server, so the skill comes from this repo). Without it, Claude still fetches and sorts comments when asked; the skill is what makes the triage consistent and opinionated. It's also plain markdown, so if you want different categories or rules, edit the file. No rebuild needed.

## Quick manual check

Test the fetcher against a real file without going through MCP:

```sh
FIGMA_TOKEN=<your-token> npm run probe -- https://www.figma.com/design/abc123/My-File
```

Prints the token owner, thread counts, and the raw grouped JSON.

## Project layout

```
src/
├── core/          # transport-agnostic: API client, threading, filters
│   ├── figma.ts
│   └── filters.ts
├── tools.ts       # MCP tool definitions (Figma client injected)
├── server.ts      # local stdio entry point (token from env)
└── probe.ts       # manual CLI check
```

`core/` and `tools.ts` never touch env vars, the filesystem, or stdio. A future hosted version (Cloudflare Workers + Figma OAuth) only needs a new entry point next to `server.ts`.

## A note from the maker

I'm a designer, and this is my first published developer tool. I built it because I kept opening Figma files to forty comment bubbles with no way to tell which ones actually needed me. It's been solid in my own daily use, but there may be rough edges I haven't hit yet. If something breaks or behaves oddly, [open an issue](https://github.com/processedfood/figma-comments-mcp/issues) and I'll take a look.

## Licence

MIT
