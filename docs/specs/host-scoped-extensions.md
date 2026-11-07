# Host-scoped extensions: a session only sees the extensions its host serves

## Problem

The tanstack-start example mounts the iOS extension (`apps/examples/tanstack-start/vite.config.ts:26`). In a
session whose widget runs on the web page, the agent still sees `ios_build`, `ios_run`, `ios_screenshot`,
`ios_logs`, and its system prompt still carries the iOS overlay rules
(`packages/extensions/ios/src/server/prompt.ts:5`: "You are running as an overlay inside a native iOS app ... not on
a web page ... never use a page snapshot"). Asked to "fill in the form in the page", the agent called
`ios_screenshot`, then `ios_run`, which asked the user for approval to boot a simulator that does not exist.

Two leaks:

- Tools: the per-session tool view (`registry.whenPageConnected`, `packages/extension/src/tool-registry.ts:179`,
  used in `packages/core/src/runtime/core-runtime.ts:75` and `packages/core/src/app.ts:500`) gates only page tools
  on page connection. Server tools from every extension reach every session.
- Prompt: extension prompts are composed once at engine start (`packages/core/src/start.ts:142-155`), written to
  one file, and handed to every session (`packages/chat/src/turn.ts:187`).

## Decision (Omri, 2026-11-07)

iOS is iOS-only. There is no use case for iOS tools or the iOS prompt in a web-hosted session. A session must not
see an extension's tools or prompt unless its host is one the extension serves.

## Design

1. **Host.** A widget knows where it runs: the web embed (`packages/embed/src/mount.ts` path) is `web`, the native
   overlay (`packages/embed/src/native-entry.ts`) is `ios`. The widget reports it when it serves a session's page:
   the `page-serving` push frame (`packages/protocol/src/push-types.ts:25`,
   `packages/client/src/push-channel.ts:73`, received in `packages/core/src/api/push.ts:72`) carries a required
   `host`. The engine keeps the host of the widget currently serving each session (next to the page bus
   subscription, which already tracks who serves the session).
2. **Extensions declare hosts.** A server extension declares the hosts it serves, required, e.g.
   `hosts: ['ios']` for iOS, `['web']` or `['web', 'ios']` for the others (decide per extension from what it
   does; page tools on the iOS overlay host page are already documented as useless in the iOS prompt). No default:
   every extension states it, so a new extension cannot leak by omission.
3. **One per-session view.** Extend the existing per-session view rather than adding a second one: the view a
   session gets filters by page connection AND by the serving host. Tool list, tool lookup, sandbox tools and
   calls are all filtered (a call to a tool outside the session's view is rejected as unknown, the same way an
   unknown tool is).
4. **Prompt follows the same rule.** The system prompt is composed per session from the extensions in its view,
   at the point each turn reads it (and wherever else the composed prompt is read, e.g. the MCP endpoint), not once
   at engine start. The per-session text must stay cheap to compute (compose from already-resolved per-extension
   strings; no file write per turn).
5. **No widget connected** (an agent driving through MCP or the CLI with no page serving the session): keep
   today's behaviour, every extension's server tools and prompt. Flag in the report if anything makes this wrong.

## Rules

- Pre-release: change every call site, no shims, no optional fields for back-compat.
- `ExtensionPromptContext` / extension types change is approved for exactly this (host on the context or the
  host filter in core; pick the smaller one and say why).
- Repo AGENTS.md applies in full: zero comments, functions not classes, no `as`/`any`/non-null, zod at every
  untrusted boundary (the frame's `host` is zod-validated), fallow clean, changeset for published packages.

## Tests

No new test files, lean: one journey in the core node test file: a session served by a `web` widget lists no
`ios_*` tools and its prompt has no iOS text; the same engine with an `ios` widget serving the session lists them
and has it. Fail-first on today's code.
