# Tool UI display in the chat thread

Date: 2026-06-17
Status: design

## Goal

Replace the generic tool-call rendering in the chat thread with per-tool rich UI: a
human-readable card per action (terminal output, diffs, page actions, test results, etc.),
the agent's reasoning surfaced as a reflection card, one live "now" status line, and an
on-page cursor + highlight mirror for page actions. The design is harness-agnostic so the
same UI works across every harness (claude, codex, gemini-cli, opencode, pi) and the future
first-party page agent, with zero widget rework when harnesses change.

Inspiration: alibaba/page-agent (the "GUI agent living in your webpage"). Rendering follows
@tanstack/ai's own convention (verified against the docs and installed types), not a foreign
pattern: tanstack has no dedicated tool-UI component; you render by inspecting message parts
(`part.type === 'tool-call'`, switch on `part.name`, read typed `part.input`/`part.output`).
Our registry is the organized, harness-agnostic form of that switch.

## Today

`packages/widget/src/chat-panel.tsx` renders every tool call through one generic `ToolCall`
(name + status + collapsible JSON args) and `ToolResult` (collapsible raw output). The only
rich case is the test runner, special-cased via `analyzeTests` into `TestCard`. Tool names
are the raw harness names (claude's `Bash`, `Edit`, the `aidx_*` MCP tools, `mcp__*`), read
straight off `ToolCallPart.name`. There is no normalization, so any richer rendering keyed on
raw names would only work for claude.

## Core idea: a canonical tool layer

A harness-independent taxonomy sits between raw tool calls and the UI. The widget registry is
keyed on the canonical kind, never a raw CLI name. This is what makes the feature survive
harness switches and the future page agent, and it honors AGENTS.md: "never special-case a
CLI in core/widget."

### 1. ToolKind taxonomy (`@aidx/protocol`)

```
type ToolKind =
  | 'shell'        // Bash / shell
  | 'file-edit'    // Edit / Write / MultiEdit / apply_patch
  | 'file-read'    // Read
  | 'search'       // Grep / Glob
  | 'page-action'  // aidx_page element verbs + future page agent actions
  | 'test'         // aidx_test
  | 'todo'         // TodoWrite
  | 'fetch'        // WebFetch
  | 'ui'           // aidx_ui
  | 'unknown'      // generic fallback
```

Plus a normalized shape the UI renders from:

```
type ClassifiedTool = {
  kind: ToolKind
  title: string                 // human label, e.g. 'Clicked "Save changes"'
  family: 'page' | 'code' | 'test' | 'read' | 'neutral'  // color rail
  fields: Record<string, unknown>  // kind-specific: {command}, {file, added, removed}, {verb, selector}, ...
}
```

### 2. Per-harness classifier (lives in each harness adapter)

Each `HarnessAdapter` exposes `classifyTool(rawName, input): ClassifiedTool`. CLI-specific
knowledge (claude `Bash` to `shell`, codex `apply_patch` to `file-edit`) stays with the CLI
adapter, never in the widget. The `aidx_*` MCP tools are aidx-owned and harness-independent,
so they classify identically on every harness; that mapping lives in a shared default
classifier the adapters delegate to. A generic fallback returns `kind:'unknown'` with the raw
name as the title for anything unrecognized.

v1 implements: claude's tools + the aidx\_\* tools + the generic fallback. codex / gemini-cli /
opencode / pi fall through to generic until their classifiers are added (they still render,
just without the rich per-kind body).

How the classification reaches the widget (verified end-to-end by review): the AG-UI
`ToolCallStartEvent` carries `metadata?: Record<string, unknown>` ("provider-specific metadata
to carry into the ToolCall", `@tanstack/ai/dist/esm/types.d.ts:839-853`). The decode emits the
`ClassifiedTool` there; `StreamProcessor.handleToolCallStartEvent` folds `chunk.metadata` onto
the part (`processor.js:643-673`) and preserves it across snapshot rebuilds. So no CUSTOM side
channel is needed. Two real caveats the plan must handle:

- The _client_ `ToolCallPart` that the widget renders (`@tanstack/ai-client` types) does NOT
  declare a `metadata` field (only `@tanstack/ai`'s wire `ToolCallPart<TMetadata>` does). The
  value arrives at runtime but is untyped on the consumer side, so the widget reads it through a
  local TypeScript declaration-merge augmentation that types `ToolCallPart.metadata` as
  `ClassifiedTool` — not an `as` cast (AGENTS.md forbids `as`).
- aidx's outbound wire converter (`uiMessagesToWire`) serializes only `{id, function{name,
arguments}}` and drops metadata. Inbound rendering is unaffected, but transcript history
  reload would lose classification — so on history load the widget re-runs the (pure) classifier
  over each tool call, or core persists+restores the metadata. The plan picks one; re-classify
  on load is simplest and keeps the classifier the single source of truth.

Timing constraint (verified, and it changes the split): the processor reads `metadata` ONLY on
`TOOL_CALL_START` (`processor.js:654-672`; the `TOOL_CALL_ARGS`/`TOOL_CALL_END` handlers never
touch it). But in claude's live stream `TOOL_CALL_START` carries only the tool NAME — the input
arrives afterward as `TOOL_CALL_ARGS` deltas (`decode.ts:104` then `deltaBlock`). So metadata
attached at START can hold only NAME-derived data (`kind`, `family`), not INPUT-derived data
(`title`, `fields`). The classification therefore splits:

- `kind` + `family` (from the tool name): attached as `metadata` at `TOOL_CALL_START`. Harness
  knows its names (AGENTS.md-compliant), available immediately, drives the icon/rail/color even
  while args stream.
- `title` + `fields` (from the input, e.g. "Clicked Save"): produced once the input is complete.
  Carrier for this is an OPEN decision (see Open questions): either a per-kind, harness-normalized
  label function the widget runs over `part.input`, or a CUSTOM event the harness emits at
  `TOOL_CALL_END` keyed by tool-call id (the metadata channel cannot deliver it post-START).

The current emit site is `_shared/agui.ts:50` (`TOOL_CALL_START` without metadata); it gains the
name-derived `{kind, family}`. The widget reads `part.metadata` for those, never the raw name in
a switch.

### 3. Widget tool-UI registry (keyed on ToolKind)

```
const toolRenderers: Record<ToolKind, {
  Icon: Component
  Result: (call: ClassifiedTool, result?: ToolResultPart) => JSX.Element
}>
```

`PartView` looks up by `kind` (the lookup runs inside the JSX/an accessor, never hoisted to a
component-init `const`, so it re-evaluates as the part object changes per token), renders header
(icon + family rail + `title` + state) and the kind-specific body. Unknown kinds use the
generic fallback (collapsible raw args/result). Adding a tool kind is one registry entry. The
current `<Switch>/<Match>` part dispatch is kept (reactive, no Streamdown remount); only the
tool branch changes.

The real `ToolCallState` is six values — `awaiting-input | input-streaming | input-complete |
approval-requested | approval-responded | complete` (`ai-client/types.d.ts:61`; there is no
`output-available` state — that is an internal tool-_result_ value). `ToolResultState` is
`streaming | complete | error`. The existing risky-Bash approval stays on its current
out-of-band path (a blocking PreToolUse hook rendered as a `GenUi` `Approval` from `genUi()`
state, not a tanstack `part.approval` lifecycle); converging onto `part.approval` only makes
sense once page actions are real client tools, so it is a follow-up, not v1.

### Renderer state contract

Every kind's renderer is a function of (call, result) and MUST handle, not just the happy path:

- error / denied: `ToolResultPart.state === 'error'` (render `part.error`, mirroring today's
  `ToolResult` error branch) and the deny case of `approval-responded`.
- streaming partial args: during `input-streaming`, `part.input` may be absent and
  `part.arguments` partial JSON. Read defensively (like the existing `toolCommand`/`prettyArgs`)
  and show the title/spinner rather than crash.
- long output: a vertical char/line cap with "show more" (mirroring the `DOM_CAP`/`CONSOLE_CAP`
  pattern in `page-handlers.ts`), so a large shell/diff body cannot blow the thread.
- accessibility: keep the log `aria-live="off"` with status announced into the existing single
  polite region; glyphs/state dots stay `aria-hidden`; no per-card live regions (they would
  flood a screen reader while streaming).

## Frontend vs backend tools (tanstack client/server model)

tanstack/ai is explicit about tool _side_: `toolDefinition().server(exec)` (`__toolSide:
'server'`, runs server-side) vs `.client(exec?)` (`__toolSide: 'client'`, runs in the
browser), registered with `clientTools(...)` + `createChatClientOptions({ tools, context })`,
and executed automatically (the runtime emits `tool-input-available`, the client runs the impl
by name, the output lands on `part.output`). Client tools receive a runtime `ctx.context`.

aidx's page actions are conceptually **client tools** (frontend tools): they execute in the
browser against the live DOM. Today they are MCP `server` tools (`aidxPageToolDef.server(...)`)
because the CLI owns the loop and calls them over MCP, round-tripping through core to the
widget. The rendering layer does not care which side executed: it renders from the tool-call
part by name/kind either way.

The future first-party page agent (tanstack loop) registers the SAME page tools via
`toolDefinition().client(exec)` + `clientTools()` + `createChatClientOptions({ tools, context })`,
with the page-driver injected through `ctx.context`. The on-page mirror lives in the client
tool's execute wrapper, and rendering reuses the same `page-action` card. So modeling page
actions as client tools is the seam that makes "frontend tools" work natively later while the
CLI path keeps working now — same definitions, same UI, different `__toolSide`.

## Pairing call + result into one card

Output can arrive two ways: on the tool-call part itself (`part.output`, for client/hybrid
tools or after approval) and/or as a sibling `tool-result` part (the CLI-decoded path emits
both a tool-call and a tool-result). The renderer reads `part.output` when present and
otherwise pairs the sibling result. Generalize the existing `resultByCallId` seam (from
`analyzeTests`) to the whole message: map result-by-callId, render each call card with its
result inline, and hide the standalone result part (as `hiddenResultIds` already does for
tests). One card per action.

## Per-tool result renderers (full set, v1)

All renderers live in the new `@aidx/tool-ui` package (see below), each obeying the renderer
state contract above.

- `shell` -> terminal block: command + output, exit-aware coloring. Horizontal scroll at narrow width.
- `file-edit` -> diff: +N / -M counts in the header, colorized hunk in the body.
- `file-read` -> file path + line range.
- `search` -> match list with counts.
- `page-action` -> human label by verb ("Clicked X", "Typed \"...\" into Y") + element chip + on-page mirror.
- `test` -> the `TestCard` (moved from the widget into `@aidx/tool-ui`; still fed by the runner).
- `todo` -> checklist with done/active/pending states.
- `ui` -> a compact chip ("rendered a form/choices"); the interactive UI itself remains the
  `GenUi` component driven by the separate `aidx-ui` CUSTOM event, which stays in the widget.
- `unknown` -> label + collapsible raw args/result.

Family color rail: page = magenta accent, code = teal agent hue, test = gold, read = purple.
Uses the existing `--pw-*` design tokens, which move into `@aidx/tool-ui` as a shared tokens
stylesheet (the widget imports it) so the cards render identically in Storybook and in the app.

## Reflection card (per step)

Claude emits free-form `thinking`/`reasoning` (decoded in `harness/src/claude/decode.ts` as
reasoning events; there is no structured per-step schema, see Constraints). The reflection
card renders the existing thinking stream styled like page-agent's card (accent rail, goal /
observation lines). If the model happens to emit recognizable structured lines (goal: /
next: /...), parse them into labeled rows; otherwise restyle the free-form text as-is. No
agent behavior change, no fabricated fields. Replaces the current collapsed "Thinking"
`<details>` for assistant turns.

## One morphing "now" line

While the turn streams, a single live status line ("Running tests...", "Editing styles.css")
replaces the per-call "Running" spinners. It reads the active tool call's `title` and morphs
in place (fade swap), with the stop control pinned right. Mirrors page-agent's separation of
transient activity from settled history. Settled cards stay in the thread above it.

## On-page mirror (page-action)

For `page-action` element verbs, draw a cursor + highlight ring on the real target element
before the handler runs. Seam: `packages/widget/src/page-driver.ts` `makeDomPageDriver.execute`
resolves the element (`page-driver.ts:29`) and then calls the handler (`page-driver.ts:37`); the
mirror goes in that gap, where the live element and `query.kind ∈ ELEMENT_KINDS` are known. (Not
`resolveTarget`, which is a pure lookup that returns an element and does no work.)

The cursor + ring is net-new code, not a reuse of react-grab: the widget's `react-grab/` has no
ring/overlay module (`capture-element.ts` only sizes inert clones). It is a small module that
draws a fixed-position ring at the element's `getBoundingClientRect()` at max z-index, animates
a cursor glide, pulses, then the handler runs. It renders into the page DOM (outside the widget
shadow root, like the page driver itself). The future page agent emits the same `page-action`
shape and reuses this mirror unchanged.

## Structured final-result card (v1, capability-gated, agent-authored)

A "done" card whose summary is authored by the agent as validated structured data. The data
model is @tanstack/ai's `structured-output` message part (`StructuredOutputPart`, in the
`MessagePart` union); the mechanics below were corrected against the installed code and a live
CLI test (the first draft named non-existent APIs).

Wiring:

1. `structuredOutput` capability on `HarnessAdapter` (capability-typed like
   `transcriptHistory`/`compaction`; can mirror their discriminated-arm enforcement to require a
   schema-args builder when true). claude and codex set it; gemini-cli / opencode / pi do not and
   are skipped with no runtime branching.
2. Pass the schema per the real CLI surfaces (both verified with `--help` + a live run): claude
   `--json-schema '<inline schema>'`, codex `--output-schema <file>`. Added in
   `harness/src/<h>/args.ts`.
3. Schema carries a prose field so conversation survives:
   `{ message, summary?, filesChanged?, pageActions?, testsPassed? }`. The text part renders
   `message`; the done card renders the rest.
4. Production is via CUSTOM events, NOT the internal helpers the first draft named
   (`appendStructuredOutputDelta` is not exported; there is no `structured-output:completed`
   wire event). `decode.ts` emits the chunks the `StreamProcessor` actually consumes:
   `CUSTOM name:'structured-output.start' {messageId}` -> the JSON via `TEXT_MESSAGE_CONTENT` ->
   `CUSTOM name:'structured-output.complete' {messageId, object, raw}` (same CUSTOM pattern aidx
   already uses for `aidx-ui`). The widget reads the resulting `structured-output` part. Do NOT
   depend on `useChat({ outputSchema })`: ai-client 0.16.3 `ChatClientBaseOptions` has no
   `outputSchema` field (doc-comment only); the part appears from the CUSTOM events regardless,
   and `outputSchema` would at most narrow the TS type of `part.data`.
5. claude-specific decode work (verified live, both required): claude implements `--json-schema`
   by forcing a synthetic `StructuredOutput` tool call and returning the result on the terminal
   `result` event's top-level `structured_output` field. So `decode.ts` must (a) extend the
   result schema to read `result.structured_output`, and (b) suppress the synthetic
   `StructuredOutput` `tool_use` block so it does not render as a junk tool card.

Cost / gating (important): `--json-schema` forces the `StructuredOutput` tool call to complete
_any_ request, so it adds an extra model round-trip on EVERY turn it is active — even a trivial
conversational reply with no real tools (a live run showed `num_turns: 5`). It is not "only when
a tool ran." The plan therefore gates it: a setting (default on for capable harnesses, optional
per the user) decides whether to pass the flag; when off, no done card and no overhead. The
capability flag + the prose `message` field keep a non-capable or schema-off turn behaving
exactly as today.

## Narrow / modal

The chat panel only holds the single-column thread, which fits any width (modal min ~300px,
quick-terminal panes, PiP). The on-page mirror lives on the real page behind the floating
widget, not in the panel, so it needs no horizontal room. Narrow behaviors: titles truncate
with ellipsis (meta/time pinned right), terminal/diff blocks scroll horizontally, the now-line
stays compact. Verified in the brainstorm mockup at the real 390px width.

## Constraints and non-goals

- Per-step structured reflection cannot be guaranteed without owning the model loop. aidx
  delegates the loop to the harness CLI, which streams free-form reasoning between native tool
  calls. page-agent gets structured reflection via a forced macro-tool (`tool_choice` every
  step) only because it owns its loop. Matching that means a new harness that runs tanstack's
  own loop, which is a separate effort (see Follow-ups). v1 stays parse-or-restyle.
- Not in scope: the scoped first-party page agent harness (tanstack loop + macro tool). It is a
  follow-up; this design ensures its page actions reuse the `page-action` card + mirror.
- Not in scope: classifiers for codex / gemini-cli / opencode / pi (generic fallback for now).

## Tools package refactor (`@aidx/tools`)

The current tool layer is the wrong shape for this feature and should be refactored as part of
it (v0, no back-compat shims per AGENTS.md). Problems today:

- Each tool builds a tanstack `toolDefinition().server(exec)` then discards the typed
  `ServerTool` to hand-roll an `AidxMcpTool = {name, description, inputSchema, run}`
  (`tools/src/types.ts`). `run` re-parses input with zod (`PageInput.parse`, `UiInput.parse`)
  although `.server(exec)` already validated. tanstack's tool system is reduced to a schema
  holder, with double validation and full type erasure.
- The shape is MCP/server-only. There is no way to instantiate the same definition as a
  `.client()` tool, which the future page agent needs.
- Per-tool human labels / classification live nowhere; the widget would have to infer them.

Refactor:

1. Tool definitions (`aidxPageToolDef`, `aidxUiToolDef`, ...) are the single source of truth and
   stay side-agnostic. The MCP server path instantiates `.server(exec)`; the future page agent
   instantiates `.client(exec)` from the same def. Drop the `AidxMcpTool` re-wrap and the
   double zod parse; `core/src/api/mcp/mcp.ts` registers from the def's schema + the `.server`
   instance directly. (`McpServer.registerTool` still gets `inputSchema.shape`.)
2. Co-locate the canonical classification with each def: a `classify(input): ClassifiedTool`
   (kind, title, family, fields) exported from the tools package. The aidx\_\* branch of the
   harness classifier delegates to it, and the future client tools reuse it, so labels/kinds
   for aidx tools are defined once and are harness-independent by construction.
3. `aidx_page` stays one tool (tool-slot economy) but its per-verb label/kind/family map becomes
   first-class data next to the def, driving both the model-facing description and the UI.
4. `AidxToolContext` (the runtime bridge) maps cleanly to tanstack's client-tool `ctx.context`
   for the future page agent; keep it a plain handle bag, no transport/CLI knowledge (already
   true).

Blast radius is contained: `@aidx/tools` (5 tool files + types) and `core/src/api/mcp/mcp.ts`,
plus the new harness classifiers. Existing tools ITs (`tools/test/*.it.test.ts`) are updated to
the new shape.

Note on ownership: only aidx's own four tools are `toolDefinition`s. The harness CLI's built-in
tools (`Bash`, `Read`, `Edit`, `Grep`, `TodoWrite`, ...) are defined inside the CLI, not by aidx;
they arrive as tool-call events and are only classified for display. That asymmetry is the whole
reason the classifier layer exists.

## New package: `@aidx/tool-ui` + Storybook

A dedicated package holds every tool renderer so adding one is centralized and each card is
viewable in isolation. Storybook is already a repo devDependency (`storybook-solidjs-vite@10.3.0`

- `storybook@10.4`, with the `.storybook` + `*.stories.tsx` pattern proven in
  `packages/solid-streamdown`); no new install.

Contents of `@aidx/tool-ui` (SolidJS):

- The `toolRenderers` registry keyed on `ToolKind`, and one component per kind (shell, file-edit,
  file-read, search, page-action, test [the moved `TestCard`], todo, ui chip, generic fallback).
- The reflection card, the morphing now-line, and the done card.
- The shared `--pw-*` design tokens stylesheet (moved out of the widget) so cards look identical
  in Storybook and in the app.
- `.storybook/` config mirroring `packages/solid-streamdown`, and a `*.stories.tsx` per renderer
  with fixture `ClassifiedTool` + `ToolResultPart` data covering each state: input-streaming,
  running, complete, error, denied, long-output-truncated, narrow-width.

Dependencies and boundaries (keep the node/browser split clean):

- Types `ToolKind` / `ClassifiedTool` live in `@aidx/protocol` (shared, no DOM).
- `classify()` lives in `@aidx/tools` (node-safe; imported by the harness decode, which is node).
- Renderers live in `@aidx/tool-ui` (browser/Solid; imports only the `ClassifiedTool` type, never
  `classify`). `@aidx/widget` consumes the registry and the on-page mirror stays in the widget
  (it needs the page driver).

How to add a tool (the centralized recipe): add/confirm a `ToolKind` in `@aidx/protocol`, a
`classify` branch in `@aidx/tools`, and a renderer + story in `@aidx/tool-ui`. Three small,
obvious edits; the registry and Storybook pick it up.

## Components touched

- `@aidx/protocol`: `ToolKind`, `ClassifiedTool`, `structuredOutput` capability on
  `HarnessAdapter`, final-result schema.
- `@aidx/harness`: per-adapter `classifyTool` (claude + shared aidx\_\* default + generic),
  emitting the `ClassifiedTool` as the tool-call's `metadata` (the per-adapter
  `TToolCallMetadata`), `--json-schema`/`--output-schema` args for claude/codex, decode mapping
  to structured-output and classified tool calls.
- `@aidx/tools`: drop the `AidxMcpTool` re-wrap, instantiate `.server()` from the shared defs,
  co-locate `classify(input): ClassifiedTool`, per-verb map for `aidx_page`.
- `@aidx/core`: `api/mcp/mcp.ts` registers tools from the def schema + `.server` instance
  directly (no `run`/re-parse indirection).
- `@aidx/tool-ui` (new): the `ToolKind` renderer registry + per-kind components, reflection card,
  now-line, done card, moved `TestCard`, moved `--pw-*` tokens, `.storybook` + stories.
- `@aidx/widget`: consume the `@aidx/tool-ui` registry from `PartView`, paired call+result
  rendering, the `ToolCallPart.metadata` declaration-merge augmentation + history re-classify, the
  on-page mirror module (page DOM, hooked in `page-driver.execute`); `GenUi`/approval path
  unchanged.

## Verification

- Widget ITs in a real browser (Playwright) against the prebuilt bundle: a turn with a shell
  call, a file edit, a page action, and a test run renders the right cards; the now-line tracks
  the active call; the mirror ring appears on the target element; narrow width truncates/scrolls
  rather than overflows.
- A harness without classifiers (simulate via the stub) falls through to the generic card with
  no errors, proving harness-agnostic behavior.
- The structured final card renders for a capable harness and is absent for a non-capable one;
  the synthetic `StructuredOutput` tool call is suppressed (no junk card); a schema-off turn is
  unchanged.
- Storybook: every renderer has a story covering its states (streaming/complete/error/denied/
  truncated/narrow); these double as the fast visual-regression surface alongside the ITs.
- `pnpm typecheck` / `pnpm build` / `pnpm test` via turbo.

## Open questions and unknowns

Honest list of what is not yet nailed down, worst first. The first two should be resolved (a
small spike each) before or early in implementation; the rest are decisions to make in the plan.

1. **Title/fields carrier (design decision, medium).** Metadata can only ride `TOOL_CALL_START`
   (name only), so input-derived `title`/`fields` need another path: (a) a per-kind label
   function the widget runs over `part.input` — simplest, no extra events, but the input field
   shapes are partly CLI-specific so the function must be kind-keyed and tolerant; or (b) a
   harness CUSTOM event at `TOOL_CALL_END` carrying the full `ClassifiedTool` by id — keeps all
   CLI knowledge in the adapter but adds a side channel and ordering to manage. Leaning (a) for
   aidx\_\* + claude, with (b) reserved if field shapes diverge across harnesses. Needs a decision.
2. **History reload classification (gap, medium).** The harness classifier is node-side; on
   transcript reload the widget cannot re-run claude's `Bash->shell` mapping. So either core
   persists+restores the tool metadata in history, or the name->kind map is made browser-importable
   (pure, no CLI process needed) so the widget re-derives it. "Re-classify on load" only works for
   the latter; pick one. Affects whether scrollback shows rich cards after a reload.
3. **Interactive renderer callbacks (gap, small).** The registry `Result(call, result)` signature
   has no callback channel, but `TestCard` needs `onFix` (sends a message) and "show more"/retry
   need handlers. The signature needs a `ctx` param (actions: sendMessage, apiBase, ...) threaded
   from the widget. Straightforward but must be designed in, not bolted on.
4. **Structured card inside the full turn pipeline (risk, untested).** `--json-schema` was
   verified in isolation. Its interaction with aidx's real turn machinery (permission gate, usage
   accounting, compaction, the synthetic `StructuredOutput` tool + extra turns) is not yet tested
   end-to-end. And codex's `--output-schema` was NOT live-tested — whether codex also forces a
   synthetic tool / where it returns the object is assumed symmetric with claude, unverified.
   Needs a spike before relying on it. Also undecided: where the on/off gating setting lives
   (per-session vs global).
5. **Mirror scope + timing (small).** Which page verbs get the cursor/ring (find/locate/inspect
   are in `ELEMENT_KINDS` but are non-visual and probably should not animate), and whether the
   animation blocks the action (adds latency to every page action) or runs fire-and-forget (ring
   may not be visible before a fast click). Decide per-verb + a short, non-blocking animation.
6. **Token scoping (small).** Moving `--pw-*` tokens into `@aidx/tool-ui`: in the app they must
   resolve inside the widget shadow root; in Storybook they resolve on `:root`. The shared
   stylesheet must work in both scopes (define on `:host, :root`), a minor but real detail.
7. **Reflection parsing heuristic (small).** "Parse structured lines if present, else restyle"
   has no defined detection rule, and extended thinking may be absent depending on model/config.
   Worst case it is a plain restyle of whatever thinking text exists; acceptable, but the
   "structured if present" half is best-effort and may rarely trigger.

## Follow-ups

- Scoped first-party page agent harness (tanstack loop + macro tool) for guaranteed structured
  reflection and zero-CLI page driving. Reuses this UI via `page-action`, and is where page
  actions become real `.client()` tools and approval can converge onto `part.approval`.
- Classifiers for the remaining harnesses (codex / gemini-cli / opencode / pi).
- Converge the risky-Bash approval gate from the out-of-band blocking hook + `GenUi` onto the
  tanstack `part.approval` lifecycle (only sensible once page actions are client tools).
