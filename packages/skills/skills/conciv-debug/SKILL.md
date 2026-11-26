---
name: conciv-debug
description: 'Use when a conciv integration misbehaves at runtime: the conciv button/widget never appears, the widget loads but never connects to the engine, a tool call or a CLI command waits on a permission card, a permission card never resolves or the agent gets denied, the engine reports a port already in use or the widget points at the wrong port, or an automated (Playwright/e2e) test against the live widget hangs. Covers the sandbox/approval/streaming runtime, not initial install (see conciv-setup) or plugin authoring (see conciv-develop).'
metadata:
  package: '@conciv/skills'
---

# Debugging a conciv integration

## Who this is for

You are looking at a conciv widget that is installed (see the conciv-setup skill if it is not) but
misbehaving at runtime: it does not show up, it shows up but cannot reach the engine, a tool call
never finishes, or a permission card never resolves. This skill is about the sandbox/approval/streaming
runtime underneath the widget, not the install step or plugin authoring; see conciv-setup and
conciv-develop for those.

Every claim below cites the file it came from.

## Failure scenario 1: the conciv button never appears

Symptom → cause → fix:

| Symptom                                    | Cause                                                                                                                                                                                                                                                                                                                                                                                                                     | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No button in a Vite production build       | The Vite plugin only runs during `vite dev` (`apply: 'serve'`, `packages/unplugin/src/core/vite.ts:313`), so neither the engine boot nor the `<script>` injection ever happens at `vite build` time                                                                                                                                                                                                                       | expected, not a bug: conciv is dev-only for Vite by construction and never ships to a Vite production build, `enabled` or not                                                                                                                                                                                                                                                                                                                                                                                     |
| No button, webpack/Rspack                  | A production build (`mode: 'production'` or no `mode`) gets no widget entry and no engine, or `enabled: false`; `mode: 'development'` and `mode: 'none'` get both                                                                                                                                                                                                                                                         | run a development build (`mode: 'development'`) in watch mode or a dev server                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| No button, custom host (no bundler plugin) | `createConciv(...).mount(el)` (from `@conciv/app`) never called, or called on an element removed before `impl.ready` resolves                                                                                                                                                                                                                                                                                             | call `mount` on an element that stays in the DOM; `mount()` is a no-op if `state !== 'unmounted'` so a second call while `'mounting'` is silently dropped (`packages/app/src/mount.ts:74-77`)                                                                                                                                                                                                                                                                                                                     |
| Button appears, panel never opens          | `open()`/`close()`/`toggle()` do not touch the panel; they emit a named panel command onto the shared event bus (`emitPanelCommand`, `packages/app/src/mount.ts:116-136`) and the widget root is the only subscriber, it starts the bus and binds `open`/`close`/`toggle` on mount (`packages/frontend-defaults/src/routes/__root.tsx:388-407`), so until it mounts there is no `panel` peer to acknowledge the handshake | a command emitted before the bus answers is QUEUED and flushed on connect (`packages/types/src/event-bus.ts:186-200`), with the `@conciv/app` client retrying the handshake every 500ms up to 60 times (`packages/app/src/mount.ts:61-72`); only after those retries does the client go `failed` and drop what it queued (`packages/types/src/event-bus.ts:165-172`). A dead button therefore means the widget never mounted inside that ~30s window, not a lost event: and a later click opens a fresh handshake |

## Failure scenario 2: widget renders but never connects to the engine

This is different from "no button": the widget script loaded, but its `apiBase` cannot reach a
running engine, or the engine rejects the origin.

- **Port mismatch.** The engine's actual bound port can differ from the one you configured. Pin it
  with `conciv({port: 7378})`. On the Vite integration a taken port is just a preference: the
  engine falls back to an OS-assigned port and logs `port ${preferred} is already in use, the engine
  is listening on http://127.0.0.1:${serving.port} instead` (`packages/backend-defaults/src/engine/start.ts:183-192`), and
  the page picks up the port it actually bound. On Next.js and the generic webpack/Rspack plugin
  the free port is picked before the client is built (Next inlines it into `next.config`'s env;
  webpack/Rspack build it into the widget entry they add): the `port` you pass, else the port in the
  project's `.conciv/server.json`, else a port picked per project (from 24170 up, from a hash of the
  project folder), each only when free. A later Next config load in the same dev server reuses the first port through
  `CONCIV_OPTIONS`. If the engine still fails to start, webpack/Rspack fail the build with the reason.
- **CORS / wrong origin.** The engine only allows loopback origins (`localhost`, `127.0.0.1`, `[::1]`)
  plus the engine's `allowedOrigins` (`originAllowed`, `packages/backend-defaults/src/engine/lib/cors.ts:23-26`).
  The Vite integration fills `allowedOrigins` with the dev server's own local and network URLs
  (`devOrigins`, `packages/unplugin/src/core/vite.ts:157-160`); there is no config option for it. A page
  served from any other host (a tunnel, a container hostname) fails CORS in the browser console before
  the widget renders a chat: open the app on a loopback URL or a URL the dev server prints.
- **Manual mount pointed at the wrong `apiBase`.** `createConciv({apiBase})` and `rebind(apiBase)`
  both no-op past the initial connect if called out of order: `rebind` only runs `rebindImpl` while
  `state === 'mounted'` (`packages/app/src/mount.ts:138-141`); calling it before `mount()` resolves,
  or after `unmount()`, is a silent no-op, not a queued reconnect.

## Failure scenario 3: a tool call waits on a card, or is refused

Every ask goes through one place: the engine's permission service, in `@conciv/backend-app-api`. `permission.assert`
(`packages/backend-app-api/src/core/permission.ts:282-311`) checks the session's rules; `deny` fails at
once with a blocked error, `allow` runs, and `ask` publishes `Permission.Event.Asked` and waits on
the user's reply with no timeout. The engine turns every `Asked` event into a card in the session's chat
stream and every `Replied` event into a settled card (`followPermissionCards`,
`packages/backend-defaults/src/engine/runtime/permission-cards.ts:198-211`). A call stuck on a card is waiting on the
user, not hung.

- **Plugin tools** ask through their own `ctx.permission.assert`. In a chat turn the call runs
  inside `settlingAsks` (`packages/backend-defaults/src/engine/app.ts:741`); from outside a turn (external MCP, the
  `conciv` CLI, raw RPC) `registry.call` runs it the same way (`runPluginTool`,
  `packages/backend-defaults/src/engine/api/rpc/router.ts:183-199`). Either way the call waits on the card: allow runs
  the tool. A reject in a chat turn becomes the tool result `The user denied running tool "<name>".
  Do not retry it; continue without it.` (`approvalDenied`, `packages/backend-defaults/src/ai/approval-denied.ts:3-7`,
  mapped in `packages/backend-defaults/src/code-mode.ts:104-109`); through `registry.call` it answers
  `APPROVAL_DENIED` (`pluginToolError`, `packages/backend-defaults/src/engine/api/rpc/router.ts:165-175`).
- **CLI commands** belong to the CLI's own permission mode first: Claude Code runs with
  `permissionMode: 'auto'` (`packages/harness/src/claude/chat.ts:130`) plus the ask rules
  `CLAUDE_ASK_RULES` (`packages/harness/src/claude/chat.ts:34`), so its classifier decides. What it escalates reaches
  conciv's tool bridge as a permission prompt (`answerPrompt`,
  `packages/backend-defaults/src/ai/image-tool-results.ts:42-52`); an ACP CLI (Gemini) asks through
  `onPermissionRequest` (`askPermission`, `packages/harness/src/gemini-cli/gemini-cli.ts:41-51`, wired at
  `packages/harness/src/gemini-cli/gemini-cli.ts:58`). Both land in `askForHarness`
  (`packages/backend-defaults/src/engine/runtime/permission-cards.ts:252-276`), which calls `permission.assert` and waits
  on the card: allow lets the CLI run the command, reject answers the CLI with
  `The user rejected <action> <resources>.` Conciv keeps no allow, ask or deny list of its own; a
  command stuck on a card is the CLI asking.
- **The same command asked twice.** Only `always` is remembered: replying `always` to a request that
  carries `save` patterns stores them and releases every other pending ask they now allow
  (`reply`, `packages/backend-app-api/src/core/permission.ts:333-392`). `once` lets this call through and
  stores nothing, and harness asks carry no `save`, so a CLI command asks again on its next call.
  Asking again is the design, not a lost decision.
- **First-response hang with no tool call involved.** `guardedAdapter`
  (`packages/backend-defaults/src/ai/run-guard.ts:102-107`) bounds the wait with two limits. Until the
  harness's first `RUN_STARTED` the start limit runs, `FIRST_START_TIMEOUT_MS` (30s,
  `packages/backend-defaults/src/backend-defaults.ts:39`), and fails the run with `the agent did not start within Ns`. From
  that `RUN_STARTED` to the first output the silence limit runs, `FIRST_OUTPUT_TIMEOUT_MS` (30s,
  `packages/backend-defaults/src/backend-defaults.ts:38`), and fails the run with `the agent produced no output within Ns`
  (both messages: `packages/backend-defaults/src/ai/chat-server.ts:886-887`). "Did not start" means the CLI never
  got going (wrong binary, missing install); "no output" means it started and went silent (stuck on
  its own prompt). Either is a harness/CLI problem, not an ask; see the conciv-harness skill if
  you're debugging a specific adapter.

## Failure scenario 4: a permission card never resolves

- **The request is already gone when the click lands.** `answerPermission` answers `gone` for an id the
  permission service no longer holds and `foreign` for one owned by another session
  (`packages/backend-defaults/src/engine/runtime/permission-cards.ts:278-295`). `decidePermissionCard` drops a `gone` card
  and returns `false` for anything but `replied`
  (`packages/backend-defaults/src/engine/runtime/permission-cards.ts:313-321`), and the RPC turns that into
  `UNKNOWN_REQUEST` (`packages/backend-defaults/src/engine/api/rpc/router.ts:67-77`), so a second click on an answered card
  surfaces as "no pending approval", not silence.
- **A card lives exactly as long as its ask.** Pending cards are read from the permission service's
  pending list (`pendingPermissionCards`, `packages/backend-defaults/src/engine/runtime/permission-cards.ts:213-221`),
  which a reload hydrates through `pendingPermissions` (`packages/backend-defaults/src/engine/app.ts:803`). An ask ends
  with its run: the waiting `assert` removes its request when it is interrupted
  (`packages/backend-app-api/src/core/permission.ts:302-306`), and `settlingAsks` then settles every card of
  that run left unanswered (`packages/backend-defaults/src/engine/runtime/permission-cards.ts:223-246`). A card that
  survives a reload is still answerable; one whose run stopped is gone.
- **Approving resumes the waiting call.** `reply` completes the ask the tool call is waiting on, so the
  tool runs at the click (`packages/backend-app-api/src/core/permission.ts:333-390`). The Claude harness
  waits up to `MCP_TOOL_TIMEOUT` for that answer (`packages/harness/src/claude/chat.ts:54`).
- **Deny ends every ask of the session.** A `reject` fails the request and every other pending request
  of the same session (`packages/backend-app-api/src/core/permission.ts:344-363`), and the harness answers
  the call with `The user rejected ...` (`packages/backend-defaults/src/engine/runtime/permission-cards.ts:272`).

## Failure scenario 5: the streams never settle, tests hang

The chat runtime deliberately has no single "settled" moment, and it is split across three surfaces
rather than one subscribe call:

- **The one-shot snapshot is `chat.hydrate`** (`packages/protocol/src/contract.ts:485-488`), served by
  the chat plane's `hydrate` (`packages/backend-defaults/src/backend-defaults.ts:144-153`). It resolves once with messages, the
  active run, the last run lifecycle, and any pending approvals; it never streams.
- **The turn itself streams over the rpc socket**: `chat.send` starts a run and streams it, and
  `chat.join` streams a run again from a `lastEventId` (`ChatJoinInput`,
  `packages/protocol/src/contract.ts:40`, used at `packages/protocol/src/contract.ts:483-484`), which is
  how a reload rejoins a run already in flight.
- **Out-of-band session events** ride the `chat.events` iterator: the session scope yields a catch-up and
  then the session bus's `events` generator (`packages/backend-defaults/src/engine/runtime/core-runtime.ts:32`), which lives
  until its `AbortSignal` fires (`packages/backend-defaults/src/engine/runtime/primitives.ts:23-40`).

Two consequences:

- **Playwright's `page.waitForLoadState('networkidle')` never resolves** against a page with the live
  widget open, because the open turn socket plus the events iterator keep the network non-idle
  forever. Wait for `'domcontentloaded'`, or for a concrete UI signal (an element appearing/its text
  changing), never `networkidle`. This mirrors the repo's own testing rule (`AGENTS.md`: "never wait for
  Playwright `networkidle` on a page with the live widget; wait for `domcontentloaded` or a UI signal").
- **A held-open browser context/page from a previous test run** keeps its subscription alive
  server-side: a bus listener is released only on abort or in the generator's `finally`
  (`packages/backend-defaults/src/engine/runtime/primitives.ts:50-56`). Always `unmount()`/close the page, don't just
  navigate away.

## Red flags: stop and check the mechanism, not the symptom

- Increasing a client-side polling/retry loop instead of checking whether the widget ever reached
  `'mounted'` state (`packages/app/src/mount.ts`): a widget stuck in `'mounting'` will retry
  forever against nothing.
- Assuming any refusal is a "denied by user": a blocked error comes from a session `deny` rule with
  no card at all (`packages/backend-app-api/src/core/permission.ts:288-297`), an interrupted ask answers
  `The ask ended before the user answered it.`, and a settled-then-clicked card reports
  `UNKNOWN_REQUEST`.
- Reaching for `networkidle` in a new Playwright check against the live widget: it will hang, not
  flake occasionally.
- Treating every hang as a harness problem: a call waiting on a permission card blocks with no
  timeout by design, so check the widget for an open card before blaming the CLI.
- Treating a stream that never goes idle as a bug: every long-lived surface here (the turn socket,
  the events iterator) is open by design; assert on a UI signal instead of on quiet.
- Debugging plugin-authoring behavior (tool contracts, panels, slots, pills) instead of runtime
  plumbing: that is the conciv-develop skill's territory; this skill covers the sandbox/approval/streaming
  runtime underneath, not how a plugin is built.

## Sources

- `packages/backend-defaults/src/ai/chat-server.ts`
- `packages/backend-defaults/src/ai/run-guard.ts`
- `packages/backend-defaults/src/ai/approval-denied.ts`
- `packages/backend-defaults/src/ai/image-tool-results.ts`
- `packages/backend-defaults/src/backend-defaults.ts`
- `packages/backend-defaults/src/code-mode.ts`
- `packages/backend-defaults/src/engine/app.ts`
- `packages/backend-defaults/src/engine/start.ts`
- `packages/backend-defaults/src/engine/lib/cors.ts`
- `packages/backend-defaults/src/engine/api/rpc/router.ts`
- `packages/backend-defaults/src/engine/runtime/permission-cards.ts`
- `packages/backend-defaults/src/engine/runtime/primitives.ts`
- `packages/backend-defaults/src/engine/runtime/core-runtime.ts`
- `packages/backend-defaults/src/engine/config.ts`
- `packages/backend-app-api/src/core/permission.ts`
- `packages/harness/src/claude/chat.ts`
- `packages/harness/src/gemini-cli/gemini-cli.ts`
- `packages/protocol/src/contract.ts`
- `packages/types/src/event-bus.ts`
- `packages/app/src/mount.ts`
- `packages/frontend-defaults/src/routes/__root.tsx`
- `packages/unplugin/src/core/vite.ts`
- `packages/unplugin/src/unplugin.ts`
- `apps/site/content/docs/troubleshooting.mdx`
- `apps/site/content/docs/usage/approvals.mdx`
- `AGENTS.md`
