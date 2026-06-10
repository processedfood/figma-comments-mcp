---
name: figma-comment-triage
description: Triage Figma comments into what the team needs to do. Use whenever the figma-comments MCP tools return comment threads, when the user pastes a Figma link and asks about comments or feedback, or says "review the comments", "what does the team need to do", "triage this file", "any comments for me".
---

# Figma Comment Triage

You have comment threads from the Figma Comments MCP server (or are about to fetch them with one of its tools: `get_all_comments`, `get_unresolved_comments`, `get_comments_mentioning_me`, `get_recent_comments`). Sort every unresolved thread into the categories below and present them in this order.

## Fetching cost rules

- Use the narrowest tool that answers the question: prefer unresolved/recent/mentions over `get_all_comments`. Pass the `page` argument when the user names a page or shares a link with a node id, `author` when they ask about one person's comments, and `search` when they ask about a topic or keyword.
- Tool output is compact text grouped by page → element, with thread ids in `[brackets]`. Resolved threads arrive as a count only; never list them individually.
- Build deep links yourself from the header pattern: `https://www.figma.com/design/<file>?#<thread-id>`.
- Long messages arrive truncated with "… (truncated)". Triage on what you have; do not re-fetch just to read the rest.
- @mentions appear inline in the message text; the last line of a thread is its last speaker.
- `reply_to_comment` posts a reply to a thread as the user (thread id from the `[brackets]`). Only use it when the user asks you to reply, and show them the exact text before or as you send it. It needs a write-scope token; if Figma returns a 403, tell the user their token is read-only.

## Categories

### 1. Needs a decision
Threads where the team has to make a call before work can move. Two sources:

- **Explicit**: someone asks "should we A or B", proposes a direction change, or pushes back on an existing choice.
- **Conflicts**: the tool output groups threads by `elementId`. Within each element group, compare unresolved takes across threads and within threads. If two people argue opposite directions about the same element (bigger vs smaller, keep vs remove, colour A vs colour B), flag it as **Needs a call**, quote both positions with their authors, and link both comments.

### 2. Open questions
Threads that end on an unanswered question. For each, name **who it's waiting on**:

- If the question @mentions someone, it waits on them.
- Otherwise it waits on whoever the question was directed at in context, usually the element's author or the previous speaker. Check who spoke last (the final line of the thread): if the asker spoke last, the other participants owe a reply.
- If genuinely unclear, say "waiting on: anyone".

### 3. Waiting for
Threads blocked on something already promised or external: "will update after the brand review", "waiting on copy from marketing", "once dev confirms". Name the person or thing being waited on and how old the thread is (each thread shows its age).

### 4. To-dos and owners
Actionable requests ("fix the spacing", "swap this icon", "export at 2x"). For each, infer the **owner**:

- An @mentioned person owns it.
- A reply like "I'll take this" or "on it" assigns it to that speaker.
- Otherwise mark it **unassigned** so it doesn't silently fall to nobody.

## Rules

- A thread lands in exactly one category. Precedence: decision > open question > waiting for > to-do. Conflicts always win.
- Resolved threads are never listed individually. Report them as one closing line: "N threads already resolved."
- Every listed item gets a deep link (built from the header pattern) so the reader can jump straight to the comment in Figma.
- Quote people briefly and verbatim where the wording matters (especially conflicts). Do not paraphrase a disagreement into something milder.
- Use each thread's age to call out anything older than 7 days as stale.

## Output format

Scannable summary in this shape:

```
## Figma comment triage — <file or filter description>

### Needs a decision (N)
- **<element / topic>**: <one-line essence>. <Author A>: "<quote>" vs <Author B>: "<quote>" → needs a call. [link] [link]

### Open questions (N)
- "<question>" — <author>, <age>. Waiting on: <person>. [link]

### Waiting for (N)
- <what's blocked> — waiting on <person/thing>, <age>. [link]

### To-dos (N)
- <task> — owner: <person | unassigned>, <age>. [link]

N threads already resolved.
```

Keep each line to one sentence. Decisions first, always. If a category is empty, omit it. End with a one-line nudge if anything is stale or unassigned, e.g. "2 to-dos have no owner."
