# Figma Comments MCP

Paste a Figma link into Claude Code and get back a sorted brief of what the team actually needs to do: decisions first, then open questions and who they're waiting on, blocked threads, and to-dos with owners. It even flags when two people leave conflicting feedback on the same element.

No more opening a file to forty comment bubbles and reading them one by one.

## How it works, in one minute

This is an MCP server. In plain terms: a small helper that runs on your machine and gives Claude Code the ability to read your Figma comments. You set it up once, then just talk to Claude:

> Triage the comments in https://www.figma.com/design/abc123/My-File

> Any comments waiting on me?

> What has Sarah said about the pricing page?

> Reply "on it" to that first one.

Claude fetches the comments through this server, sorts them, and gives you links that jump straight to each comment in Figma.

## Setup

You'll do this once. It takes about five minutes, and two of the steps are copy-paste.

**You need:** [Claude Code](https://claude.com/claude-code) and [Node.js](https://nodejs.org) (the runtime this server runs on; download the LTS version, click through the installer, done).

### 1. Get a Figma token

A token is like a password that lets the server read comments as you, and only that.

On figma.com: your avatar → **Settings** → **Security** → **Personal access tokens** → create one. Under scopes, set **File comments** to *read*, or *write* if you also want to reply to comments from Claude. Copy the token; Figma only shows it once.

### 2. Save the token on your machine

Open the Terminal app and paste this line, replacing `your-token-here` with the token you copied:

```sh
echo "FIGMA_TOKEN=your-token-here" > ~/.figma-comments-mcp.env
```

This saves the token into a small hidden file in your home folder. It stays on your machine and is only ever sent to Figma. When the token expires, repeat this step with a new one. That's the whole renewal process.

### 3. Connect it to Claude Code

Paste this in the Terminal:

```sh
claude mcp add figma-comments -- npx -y figma-comments-mcp
```

Done. Open a Claude Code session, paste a Figma link, and ask about the comments.

If you skipped step 2, don't worry: the server will tell you exactly what to do instead of failing silently.

### Optional: smarter sorting

The repo includes a small "skill" file, [`.claude/skills/figma-comment-triage/SKILL.md`](.claude/skills/figma-comment-triage/SKILL.md), that teaches Claude exactly how to sort the comments (what counts as a decision, how to spot conflicting feedback, how to infer who owns a to-do). Copy that folder into your own project's `.claude/skills/` folder to get the same triage. Without it things still work; the sorting is just less opinionated.

## What you can ask for

You don't need to learn commands. Phrases like these map onto the server's tools automatically:

| You say | What happens |
| --- | --- |
| "all the comments in <link>" | Every thread in the file |
| "unresolved comments" | Only threads not yet resolved in Figma |
| "comments mentioning me" | Threads where you're @mentioned (it knows who you are from your token) |
| "what's new since yesterday?" | Threads with activity in the past 24 hours |
| "reply 'on it' to that thread" | Posts the reply to Figma as you (needs the write token) |

You can narrow any of these by page ("on the Homepage page"), by person ("Sarah's comments"), or by topic ("about the pricing table").

## Good to know

- **Replies are sent as you.** Claude will show you the text it's about to post. If your token is read-only, fetching still works and only replying is refused, with a clear message.
- **Long files stay cheap.** Output is kept compact on purpose: resolved threads come back as a count rather than full text, long comments are trimmed, and very busy files show the newest 50 threads with a note on how to narrow down. This keeps Claude fast and your usage costs low.
- **Page filtering has one rare gap.** Figma anchors comments to top-level frames; a comment pinned to something deeply nested may not match a page filter and will only show in unfiltered results.

## A note from the maker

I'm a designer, and this is my first published developer tool. I built it because I kept opening Figma files to forty comment bubbles with no way to tell which ones actually needed me. It's been solid in my own daily use, but there may be rough edges I haven't hit yet. If something breaks or behaves oddly, [open an issue](https://github.com/processedfood/figma-comments-mcp/issues) and I'll take a look.

## For developers

The five MCP tools are `get_all_comments`, `get_unresolved_comments`, `get_comments_mentioning_me`, `get_recent_comments` and `reply_to_comment`. The fetch tools share optional `page`, `author`, `search` and `max_threads` arguments; recent also takes `hours`.

```
src/
├── core/          # transport-agnostic: API client, threading, filters
│   ├── figma.ts
│   └── filters.ts
├── tools.ts       # MCP tool definitions (Figma client injected)
├── server.ts      # local stdio entry point (token from env or ~/.figma-comments-mcp.env)
└── probe.ts       # manual CLI check
```

`core/` and `tools.ts` never touch env vars, the filesystem, or stdio. A future hosted version (Cloudflare Workers + Figma OAuth) only needs a new entry point next to `server.ts`. To run from a clone instead of npm: `npm install && npm run build`, then register with `claude mcp add figma-comments -- node /path/to/repo/dist/server.js`. Quick check against a real file without MCP: `FIGMA_TOKEN=xxx npm run probe -- <figma-url>`.

## Licence

MIT
