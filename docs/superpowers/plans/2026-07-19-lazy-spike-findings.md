# Spike findings: tool path per harness × lazy discovery reachability

Date: 2026-07-19. Task 1 of `2026-07-19-lazy-discovery-code-mode.md`, extended with the
reviewer-raised questions (gate firing, cross-turn discovery persistence).

## How tools actually reach each harness

Two distinct MCP surfaces exist, and neither is the one the plan assumed:

1. **The sandbox tool bridge** (`@tanstack/ai-sandbox` `tool-bridge`): `chat({tools})` is
   provisioned into an in-sandbox MCP server named `tanstack`; the CLI sees
   `mcp__tanstack__<name>`; adapter stream translators strip the prefix
   (`@tanstack/ai-claude-code/dist/esm/adapters/text.js:164-167` — `provisioner.provision(options.tools ?? [])`
   when `options.tools` non-empty). This is the live path for chat-run tools on adapters that
   support it.
2. **conciv's own `/api/mcp`** (`packages/core/src/api/mcp.ts`, client prefix `mcp__conciv__`):
   wired into claude's **tty/launch/sdk** modes via `claudeMcpArgs`
   (`packages/harness/src/claude/args.ts:10`, `index.ts:28`, `tty.ts:9`, `sdk.ts:43`) — NOT into
   `claudeChatConfig` (`packages/harness/src/claude/chat.ts` builds `claudeCodeText` with no
   `mcpUrl`). Chat turns do not use it; external/interactive agents do.

Per harness (`packages/harness/src/*/index.ts`):

| Harness    | `capabilities.mcp` | chat-run tool path                                                                                                   |
| ---------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| claude     | `'http'`           | bridge (`mcp__tanstack__*`), provisioned from `chat({tools})`                                                        |
| codex      | `'none'`           | in-process `codexText`; tools via bridge/in-proc executor                                                            |
| opencode   | `'none'`           | **not bridged** — `@tanstack/ai-opencode/dist/esm/adapters/text.d.ts:45`: "chat()-provided tools aren't bridged yet" |
| gemini-cli | `'none'`           | same generation of adapters; assume unbridged until proven otherwise                                                 |
| pi         | `'none'`           | pi-native tool contract                                                                                              |

## Does chat()-level `lazy: true` reach the CLIs?

**Yes for the visible list, with one hard gap.** `chat()` hands adapters its ACTIVE tool set
(`LazyToolManager.getActiveTools()`), so a bridged CLI is provisioned with eager tools plus
`__lazy__tool__discovery__` — the context reduction lands inside the CLI's own prompt, which is
where the pollution actually lives. The gap:

- **The bridge is static per provision.** `@tanstack/ai-sandbox` has no `tools/list_changed`,
  no dynamic registration, no lazy awareness (verified by grep over its dist). A tool discovered
  mid-turn is returned as schema text but is NOT callable as an MCP tool until the next
  provision (next turn/spawn).

## Cross-turn discovery persistence (reviewer finding)

`LazyToolManager` re-derives discovered state each `chat()` call by scanning message history for
the synthetic discovery call + its `role: 'tool'` result. Combined with the static bridge, the
usable flow on bridged harnesses is: discover in turn N → callable in turn N+1 — but ONLY if
conciv's persisted history retains those synthetic messages. claude has
`transcriptHistory: true` (history merges from the CLI transcript by msgid) — the synthetic
discovery messages are chat()-layer constructs, so whether they survive the merge is UNVERIFIED
and must be tested before relying on lazy for claude.

## Approval-gate reality check (security reviewer, confirmed against source)

- Risky set: `mcp__conciv__<name>` for `approval: 'ask'` tools (`packages/core/src/app.ts:155`).
- Chat-middleware gate compares BARE names (`packages/core/src/chat/gate.ts` `gatedTools` →
  `gate.decide(tool.name, ...)`); bridge-visible names are `mcp__tanstack__<name>`. Three name
  formats, one set: only the `mcp__conciv__` CLI-callback path matches. In-process/no-callback
  harnesses (codex: `permissionGate: 'none'`) execute 'ask' tools UNGATED today. Pre-existing
  bug, inherited by the plan, must be fixed in this work: normalize names at the gate (strip
  known `mcp__<server>__` prefixes and match bare names).

## GO / ADAPT decision

**ADAPT**, three amendments:

1. **Lazy stays at chat() level (Task 4 unchanged)** — it correctly shrinks what bridged CLIs
   see. Accept discover→next-turn callability for v1 IF the persistence test passes; file an
   upstream issue on `@tanstack/ai-sandbox` for `tools/list_changed` re-provisioning. If
   persistence fails, lazy for bridged harnesses is a no-go until history retention is fixed
   in conciv's attach/session layer (Task 4 gains that fix as a precondition).
2. **Task 5 (MCP parity) is real but re-scoped**: `/api/mcp` serves tty/launch/sdk modes and
   external agents — apply the same lazy split there via the MCP SDK's dynamic registration +
   `sendToolListChanged` (the SDK supports it even though the sandbox bridge does not).
3. **Gate normalization becomes a new task** (before enabling anything): risky matching must be
   prefix-agnostic; add per-harness gate-firing tests for an `approval: 'ask'` tool.

## Code Mode consequences

`execute_typescript` is ONE eager tool through the bridge — static provisioning is a non-issue
for it, and its `code_mode:*` events flow through the bridge's `emitCustomEvent` (explicitly
supported: `tool-bridge.d.ts` documents code mode console events). Code Mode is therefore the
LEAST bridge-sensitive way to expose many tools to CLI harnesses: verified viable for claude
first, with the reviewer-mandated fixes (real sessionId threading, per-tool `codeMode` opt-in,
`probeIsolatedVm` fail-closed at startup, wire `codeMode.tools` not `codeMode.tool`).

---

## EMPIRICAL RESULTS (Task 1, appended 2026-07-19)

Two artifacts back these results:

1. **Committed deterministic proof** — `packages/core/test/chat/lazy-extension-tools.it.test.ts`
   (4 tests, always-run, no real CLI). Drives `@tanstack/ai`'s `chat()` directly with a
   recording adapter (via `@conciv/harness` `makeTextAdapter`) and conciv's own tool-construction
   seam (`toChatTool` for the eager tool; `toolDefinition({lazy: true}).server(...)` for the lazy
   tool — the exact shape Task 4 will emit). It pins the `chat()`-layer contract:
   - Initial model call is offered the eager tool + `__lazy__tool__discovery__` and **never** the
     undiscovered lazy tool.
   - The discovery catalog honors `lazyToolsConfig: {includeDescription: 'first-sentence'}` — it
     carries the lazy tool's first sentence only, not its full prose (this is exactly the config
     Task 4 sets in `run.ts`).
   - Calling discovery returns the lazy tool's full JSON schema, and the tool becomes offered on
     the **next** model call within the same `chat()` invocation.
   - When the discovery call + `role: 'tool'` result messages are threaded into a second `chat()`
     call's `messages`, `LazyToolManager.scanMessageHistory` re-derives the discovered state and the
     lazy tool is offered from the first model call of turn 2 with **no** re-discovery.

   This is the load-bearing invariant Task 4 depends on: chat()-layer lazy works, and cross-turn
   persistence works **iff the synthetic discovery messages are present in `messages`**.

2. **Real claude bridge run** — a throwaway `chat()`-driven turn against the local claude binary
   (`claude 2.1.215`, native install, authenticated; run via a temporary core vitest, since the
   real adapter needs the package's node_modules to resolve; deleted after recording). Two real
   turns, tools `[demo_status (eager), demo_search (lazy)]`, `lazyToolsConfig: first-sentence`,
   auto-allow gate, real conciv sandbox + gate middleware — the same wiring `run.ts` uses.

   **Turn 1 (discover + use in the same turn):**
   - Tool calls observed: `["__lazy__tool__discovery__", "demo_search", "__lazy__tool__discovery__"]`
   - `demo_search.execute` **never ran** (side-effect log empty).
   - claude's own words: `No such tool available: mcp__tanstack__demo_search`.

   **Turn 2 (resume of the same session):**
   - Tool calls: `["demo_search"]` — `demo_search.execute` still **never ran**; same failure.

### Answer (a): is a mid-run-discovered tool callable within the same turn through the claude bridge?

**NO — confirmed empirically.** claude's CLI runs its _entire_ agentic turn inside one spawn; the
adapter's `chatStream(options)` provisions the tool bridge exactly once, from the initial
`getActiveTools()` set (eager + discovery, **not** the lazy tool), then relays claude's NDJSON.
`chat()`'s `LazyToolManager` re-provision loop is never re-entered mid-turn for claude. The
discovery tool _is_ provisioned (it is in the initial active set) and _does_ execute in-process,
returning the schema — but the discovered tool itself is never registered on the static bridge, so
the CLI's `mcp__tanstack__demo_search` call fails with `No such tool available`. Root cause:
`@tanstack/ai-sandbox`'s tool bridge has no `tools/list_changed` / dynamic registration (verified
against dist in the static analysis above; now confirmed at runtime).

### Answer (b): do the synthetic discovery messages survive conciv's persisted history across turns for a `transcriptHistory: true` harness (claude)?

**NO — and worse than the plan feared.** The failure is not in a merge dropping the messages by
msgid; conciv never hands them to `chat()` at all. `historyFor` (`packages/core/src/chat/run.ts`)
returns `[]` whenever the session is resumable, because claude resumes from its **own** CLI
transcript rather than conciv's merged messages. So turn 2's `chat()` receives only the new user
message; the fresh `LazyToolManager` scans that, finds no discovery call, and leaves `demo_search`
undiscovered → it is not provisioned into turn 2's bridge either. Net: **chat()-level lazy
extension tools are never callable on claude** — not same-turn (static bridge) and not cross-turn
(resume bypasses the `messages` array the manager scans). The scripted test proves the cross-turn
mechanism _does_ work when the discovery messages are threaded into `messages`; claude's resume
path is precisely what prevents that threading.

### GO / ADAPT refinement (supersedes the amendment-1 wording above)

- **Raw `lazy: true` extension tools are a NO-GO for claude as wired today.** They correctly shrink
  what the CLI sees (context win holds), but the model can discover a tool and then cannot call it —
  a strictly worse UX than eager tools. Marking extension tools `lazy` (Task 4) is safe to land only
  behind one of these preconditions for any bridged, resume-based harness (claude):
  1. **Code Mode (preferred, already the plan's Task 7).** One eager `execute_typescript` tool is
     always provisioned; the many extension tools become in-sandbox bindings reached through it, so
     no bridge re-provisioning is ever needed. This is the empirically-supported path for exposing
     many tools to claude. Task 7 stands; its importance is upgraded from "least bridge-sensitive" to
     "the only bridge-viable multi-tool surface for claude."
  2. **Thread the synthetic discovery messages into `chat()` `messages` even on resume** — i.e.
     `historyFor` must stop returning `[]` for the discovery call + result pair (or conciv must
     replay a compacted discovery preamble). Without upstream `tools/list_changed`, this still only
     yields discover-in-turn-N → callable-in-turn-N+1, never same-turn. Treat as a Task 4
     precondition **only if** we want raw lazy extension tools on claude at all; given (1), we may
     simply **not** mark bridged-harness extension tools lazy and lean on Code Mode instead.
- **Task 4 as written (mark all extension tools `lazy: true` globally) must be re-scoped:** either
  gate `lazy` on a harness capability (only enable for harnesses whose adapter re-provisions per
  model round — none today), or keep extension tools eager on claude and expose the bulk via Code
  Mode. Do not ship global `lazy: true` for claude expecting discovered tools to be callable.
- Amendments 2 (MCP parity re-scope) and 3 (gate normalization) are unchanged.

### Upstream issue to file (DRAFT — do not file yet; user verifies before anything leaves the machine)

Target repo: `@tanstack/ai-sandbox` (the tool-bridge provisioner). File under the TanStack AI repo.

> **Title:** Tool bridge is static per provision — lazy-discovered tools are never callable through
> CLI adapters (claude-code)
>
> **Body:**
>
> When `chat()` is used with `lazy: true` tools and a CLI adapter that provisions the sandbox tool
> bridge once per model turn (e.g. `@tanstack/ai-claude-code`), a tool the model discovers mid-turn
> via `__lazy__tool__discovery__` is returned with its schema but is **not callable**: the CLI
> reports `No such tool available: mcp__tanstack__<name>`.
>
> Root cause: the bridge provisioned by `@tanstack/ai-sandbox` from `options.tools` is static for
> the life of the spawn. There is no `tools/list_changed` notification and no dynamic
> registration, so when `LazyToolManager.getActiveTools()` grows after a discovery call, the newly
> active tool never reaches the running MCP bridge. CLI adapters that run their whole agentic loop
> in a single spawn (claude-code) never re-enter `chatStream`, so the growth is never provisioned.
>
> **Reproduction:** `chat({adapter: claudeCodeText, tools: [eager, {…, lazy: true}],
lazyToolsConfig: {includeDescription: 'first-sentence'}})`; prompt the model to discover then
> call the lazy tool. Observed: discovery succeeds, the lazy tool call fails with
> `No such tool available`, and the tool's `execute` never runs.
>
> **Ask:** either (1) support `tools/list_changed` + dynamic (re-)registration on the sandbox tool
> bridge so a lazy tool discovered mid-turn becomes callable, or (2) document that `lazy: true` is
> unsupported for single-spawn CLI adapters and have the adapter provision the full (non-lazy)
> tool set so discovered tools are at least callable. Today `lazy` silently produces
> discoverable-but-uncallable tools on these adapters.

## Approval audit (Task 6b step 4b)

Every `defineTool`/tool-def across `packages/extensions/*` and `packages/tools` classified. Rule
applied: a tool that **destroys or removes** user content, or executes/spawns outside the draft,
gets `approval: 'ask'`; additive/draft-only/read-only tools stay unguarded. Bias is conservative —
only tools already flagged were flagged; no new flags were added because none of the unguarded
tools are clearly destructive (see judgment calls below).

### Whiteboard — canvas (`packages/extensions/whiteboard/src/tool/canvas/def.ts`)

| Tool           | approval | Classification                                                                        |
| -------------- | -------- | ------------------------------------------------------------------------------------- |
| canvas.read    | —        | Read-only.                                                                            |
| canvas.svg     | —        | Writes to the **hidden draft** only; reversible via canvas.discard; commit publishes. |
| canvas.draw    | —        | Draft only, reversible.                                                               |
| canvas.diagram | —        | Draft only, reversible.                                                               |
| canvas.connect | —        | Additive (draws a binding arrow); non-destructive.                                    |
| canvas.update  | —        | Edits an existing element in place; non-destructive, reversible on the shared canvas. |
| canvas.delete  | **ask**  | Destructive — removes an element. Guarded. ✓                                          |
| canvas.clear   | **ask**  | Destructive — wipes every element. Guarded. ✓                                         |
| canvas.export  | —        | Read-only export (json/png).                                                          |
| canvas.commit  | —        | Publishes the agent's own draft; additive, non-destructive.                           |
| canvas.discard | —        | Discards only the agent's uncommitted draft, never published/user content.            |
| canvas.preview | —        | Read-only PNG of the draft.                                                           |

### Whiteboard — comment (`packages/extensions/whiteboard/src/tool/comment/def.ts`)

| Tool            | approval | Classification                                               |
| --------------- | -------- | ------------------------------------------------------------ |
| comment.create  | —        | Additive (pins a note).                                      |
| comment.reply   | —        | Additive (threaded reply).                                   |
| comment.read    | —        | Read-only.                                                   |
| comment.list    | —        | Read-only.                                                   |
| comment.resolve | **ask**  | State change on user content. Guarded. ✓                     |
| comment.delete  | **ask**  | Destructive — removes a comment/thread + its pin. Guarded. ✓ |
| comment.move    | —        | Repositions a pin; non-destructive, reversible.              |
| pin.setState    | —        | Sets pin lock/offset; non-destructive.                       |

### Whiteboard — element / anchor

| Tool              | approval | Classification              |
| ----------------- | -------- | --------------------------- |
| element.reference | —        | Read-only component lookup. |
| anchor.resolve    | —        | Read-only drift check.      |

### Recorder (`packages/extensions/recorder/src/tool/def.ts`)

| Tool            | approval | Classification                                                 |
| --------------- | -------- | -------------------------------------------------------------- |
| recording_start | —        | Starts observing the user's own page; non-destructive.         |
| recording_stop  | —        | Stops + returns an action log/keyframes; observation only.     |
| recording_pull  | —        | Reads the last N seconds of the always-on recorder; read-only. |

### Test runner (`packages/extensions/test-runner/src/tool/def.ts`)

| Tool        | approval | Classification                                                                     |
| ----------- | -------- | ---------------------------------------------------------------------------------- |
| test_runner | —        | list/status are read-only; `run` spawns the **configured** test runner. See below. |

### conciv built-in tools (`packages/tools/src`)

`ConcivServerTool` (`packages/tools/src/types.ts`) has **no `approval` field**, and these tools are
not part of `opts.extensions`, so the extension risky set in `app.ts` never covers them. They are
therefore outside the approval-gate mechanism this task hardens (the chat-middleware Bash gate and
the extension `approval: 'ask'` path).

| Tool              | mutates? | Classification                                                                             |
| ----------------- | -------- | ------------------------------------------------------------------------------------------ |
| conciv_ui         | no       | Asks the user a question; the user answers. Non-mutating.                                  |
| conciv_page       | **yes**  | Reads and **drives** the user's live dev-page DOM (click/fill/submit/override). See below. |
| conciv_open       | no       | Opens a file in the editor; does not write.                                                |
| conciv_extensions | no       | catalog/scaffold/validate return code strings; the model writes files, not this tool.      |

### Judgment calls (unguarded but reviewed)

- **test_runner.run** — spawns the project's configured test runner (bounded to list/run/status with
  a pattern, not arbitrary shell). Developer-initiated dev action on their own project; not
  destructive in the delete-records/write-files sense. Left unguarded, consistent with the
  command-policy philosophy where non-destructive dev commands run freely. Flag candidate only if
  product decides test execution warrants a prompt.
- **conciv_page** — drives the user's own local dev page in their own browser (the product's core
  inspect-and-drive loop). Mutating, but scoped to the user's app, developer-initiated, and gating
  every DOM action would break the loop. The `ConcivServerTool` contract has no `approval` field and
  this path is not covered by the extension risky set, so guarding it would be a separate design
  change, not a fix to the hole this task closes. Documented decision, not a defect.

### Net change

No `approval` flags were added or removed. The two destructive canvas tools (delete, clear) and two
destructive comment tools (resolve, delete) were already flagged and remain the only guarded
extension tools; the fix in this task is what makes those four flags actually fire on the scripted
in-process path (previously bypassed by the prefix mismatch).

---

## Task 7 redesign (user decision, 2026-07-19)

The plan's Task 7 (opt-in `codeMode: true` flag, `approval: 'ask'` tools EXCLUDED from Code Mode,
non-lazy bindings) was superseded by an explicit user decision: **wrangler/Cloudflare-style —
everything reachable through Code Mode, nothing broken anywhere, approvals still fire.** What
actually shipped in `packages/core/src/chat/code-mode.ts`:

- **All extension tools are bound.** No `codeMode` opt-in field on `ExtensionTool`/`ExtensionServerTool`
  (never added). `makeCodeMode(extensionTools, request, gate)` binds every tool via `toChatTool`.
- **Bindings are lazy + the discovery companion is kept.** Each binding is built with
  `toChatTool(tool, run, {lazy: true})`, so `createCodeMode` filters them all into the "Discoverable
  APIs" catalog (kept out of the eager system-prompt docs) and returns the `discover_tools`
  companion. We wire `codeMode.tools` (PLURAL — `[execute_typescript, discover_tools]`) into
  `chat({tools})`, not just the single tool. Verified against the installed dist
  (`@tanstack/ai-code-mode@0.3.7`): `createCodeMode` (`create-code-mode.js`) does
  `config.tools.filter(t => t.lazy)` → builds `discover_tools` iff any lazy tool exists, and returns
  `{tool, discoveryTool, tools, systemPrompt}`. Critically, `createCodeModeTool`
  (`create-code-mode-tool.js`) binds ALL tools as callable `external_*` sandbox functions
  (`toolsToBindings(tools)`) regardless of `lazy` — `lazy` only controls documentation placement, so
  an all-lazy set stays fully reachable through `discover_tools` + `execute_typescript`.
- **Approval-gated tools are gate-wrapped, not excluded.** `gatedToolRun(tool, request, gate)`
  consults the SAME run gate instance the chat middleware uses (`makeRunGate` in `buildRunStream`) via
  `gate.decide(tool.name, input, sessionId, randomUUID())` BEFORE calling `tool.execute`. On `deny`
  it throws a structured refusal (matching the existing `gatedTools` precedent in `gate.ts`), which
  the isolate driver surfaces to the sandbox as an error result — never a silent success. On `allow`
  it executes. Security-critical, covered by `code-mode.test.ts` `gatedToolRun` tests against the
  real `makeRunGate` (deny → execute never runs + throws; allow-reply → executes and returns).
- **Timeout choice: `CODE_MODE_TIMEOUT_MS = 150_000`.** Verified path: the code-mode `timeout` flows
  to `IsolateContext.execute` → isolated-vm `script.run({timeout, promise: true})`
  (`ai-isolate-node/isolate-context.js`), bounding the sandbox script's execution. `gate.ts` sets
  `APPROVAL_TIMEOUT_MS = 120_000`. 150s > 120s guarantees a sandbox script that triggers one
  approval-gated tool and waits the full approval window is not killed mid-wait, whether the wait
  counts as CPU or wall-clock time. CAVEAT: a single `execute_typescript` that sequentially triggers
  multiple approvals could still exceed 150s if the timeout is wall-clock; the single-approval case
  (the requirement) is safe.
- **Driver: probe-gated module singleton, fail closed.** `getDriver()` returns a cached
  `createNodeIsolateDriver(...)` only if `probeIsolatedVm().compatible`; otherwise `null` →
  `makeCodeMode` returns `null` and no code-mode tools/prompt are wired. No mid-run throw (isolated-vm
  on an incompatible Node segfaults the 127.0.0.1 server). Verified export names + probe field
  (`{compatible, error?}`) against `ai-isolate-node/dist/esm/isolate-driver.{d.ts,js}`.
- **Real session threading + capability gating.** `buildRunStream` calls `makeCodeMode` only when
  `deps.harness.capabilities.codeMode` is true, with `{sessionId, model: req.model ?? null}` — never
  an empty sessionId. `codeMode?: boolean` added to `HarnessCapabilities`
  (`packages/protocol/src/harness-types.ts`); set `true` ONLY on the claude harness. `ChatDeps` gained
  `extensionServerTools: () => ExtensionServerTool[]`, wired from `makeApp` to reuse the same
  `extensionTools` array handed to `buildChatTools`.
- `toChatTool`'s return type was widened from `AnyTool` to `ServerTool` so the bindings carry the
  `__toolSide: 'server'` brand `createCodeMode` requires (`ServerTool` is still assignable to
  `AnyTool`, so all existing callers are unaffected).

---

## Task 5 implementation notes (`/api/mcp` lazy projection)

The `/api/mcp` route now mirrors the chat-path lazy split: `tools/list` initially exposes only the
conciv core tools plus `conciv_discover_tools`; every extension tool is hidden until discovered.
`conciv_discover_tools` takes `{names: string[]}` (zod-validated via the SDK `registerTool`
`inputSchema` shape), returns `{discovered: [{name, description, inputSchema}], unknown: [...]}` per
requested name (JSON Schema via `z.toJSONSchema`, zod 4.4.3), and never calls `tool.execute` — pure
metadata. Discovered names are additive to the session's set; the newly discovered tools appear in
`tools/list` and become callable on the NEXT request in the same conciv session.

- **Stateless-server adaptation.** `buildServer` builds a FRESH `McpServer` per POST
  (`sessionIdGenerator: undefined`, `enableJsonResponse: true`), so there is no long-lived server and
  `sendToolListChanged`/dynamic live registration is meaningless. The correct mechanic is a
  per-session discovered-names store consulted at build time: each POST registers core tools +
  `conciv_discover_tools` (registered whenever any extension tool exists) + only the extension tools
  whose names are in the session's discovered set. Discovery mutates the set; the following POST's
  freshly built server reflects it. No second server, no renamed tools — invariant (a) holds.
- **Store seam: owned by `McpVars`, not module scope.** `McpVars.mcp` gained
  `discovered: Map<string, Set<string>>`, created in `makeApp` (`new Map()`). This ties the store's
  lifetime to the app instance. A module-scoped Map would leak discovered state across independent
  `makeApp` instances in one process (the testkit boots many), so the app-owned seam is both cleaner
  and correct for isolation. Keyed by `sessionIdFromHeaders(...) ?? ''`.
- **Anonymous-bucket caveat.** External agents may omit `conciv-session-id`; those requests share the
  `''` bucket, so one anonymous caller's discoveries are visible to another anonymous caller. Accepted
  for v1 — the server binds `127.0.0.1` only and interactive/external agents are trusted local
  processes. Real conciv sessions (chat, claude tty/launch/sdk) always carry a branded session id and
  get isolated buckets.
- **Client-side gating unchanged (invariant c).** The `/api/mcp` execute path has NO server-side
  approval gate today — gating for this surface is the CLI's own permission callback fed by the risky
  set. This task does not change that. What holds server-side, and what the test asserts: a discovered
  `approval: 'ask'` tool registers under its UNCHANGED bare name (`acme_delete`, surfaced client-side
  as `mcp__conciv__acme_delete`), and `riskyMatches` (Task 6b) strips the `mcp__conciv__` prefix and
  matches the bare-name risky set — so `riskyMatches(risky, 'mcp__conciv__acme_delete')` is true.
  Lazy discovery does not rename or un-risk the tool.
- **Downstream fallout (contract change, v0).** Extension tools are no longer eagerly listed on
  `/api/mcp`, so the shared testkit seam `makeCallTool` (`packages/harness-testkit/src/call-tool.ts`)
  now discovers a tool before calling it (only when it is not already listed, so core tools and
  extension-free apps are unaffected) — this is the real client flow. Direct-client ITs that asserted
  eager extension listing (`packages/core/test/api/**`, recorder + test-runner extension ITs) were
  updated to `callTool('conciv_discover_tools', {names})` before listing/executing.
