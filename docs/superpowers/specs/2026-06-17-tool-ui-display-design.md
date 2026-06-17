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

### 2. Classification: a pure function, run client-side (resolved by spike)

Classification is a pure function `classify(name, input): ClassifiedTool`, one per harness, plus
a shared `aidx_*` classifier and a generic fallback. It runs **in the widget**, not in the
harness stream. This was the original open question (how to carry the `ClassifiedTool` to the
widget); the spike settled it decisively in favor of client-side classification:

- A metadata carrier can only ride `TOOL_CALL_START` (`processor.js:654-672`; the ARGS/END
  handlers never touch metadata), and claude's `TOOL_CALL_START` has the name but NOT the input
  (args stream afterward as `TOOL_CALL_ARGS`, `decode.ts:104`). So metadata could never carry the
  input-derived `title`/`fields`. Also the client `ToolCallPart` doesn't even declare `metadata`,
  and aidx's wire converter drops it on persist.
- But the widget already has everything it needs on the part: `name`, and the args (accumulated
  into `arguments` and `parsedArguments`/`input` by the processor — `handleToolCallArgsEvent`).
  History reload carries the same (`claude/history.ts:54-58` emits `tool-call` with `name` +
  `arguments`). And the widget already knows the active harness (`models.harness` in
  `mount.tsx`/`model-selector.tsx`).

So the widget calls `classify(harnessId, name, input)` per tool-call part, reading `part.input`
(or `JSON.parse(part.arguments)` defensively while streaming). No metadata, no decode change, no
CUSTOM side channel, no persistence, no timing problem, and history re-derives identically. `kind`
is available from the name immediately (icon/rail render while args stream); `title`/`fields` fill
in once the args complete.

Where the classifiers live (AGENTS.md: "never special-case a CLI in core/widget"): each harness's
classifier is a pure, node-dep-free function owned by its adapter and exposed through a
browser-safe entry (`@aidx/harness` classify barrel keyed by harness id); the `aidx_*` classifier
lives in `@aidx/tools` (browser-safe). The widget calls `classify(harnessId, ...)` from that lib —
no CLI `if` in widget code; the per-CLI knowledge stays in the classifier modules. v1 ships the
claude classifier + the `aidx_*` classifier + the generic fallback; codex / gemini-cli / opencode
/ pi fall through to generic (still render, just without rich per-kind bodies) until added.

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
3. Schema carries a prose field so conversation survives, and MUST be OpenAI-strict to work on
   codex (verified live: codex rejected a schema with optional fields —
   `'required' ... must include every key in properties`). So every property is required and
   `additionalProperties:false`; "optional" fields are required-but-emptyable (e.g.
   `filesChanged: []`, `summary: ""`). Shape:
   `{ message, summary, filesChanged[], pageActions[], testsPassed }` all required. The text part
   renders `message`; the done card renders the rest.
4. Production is via CUSTOM events, NOT the internal helpers the first draft named
   (`appendStructuredOutputDelta` is not exported; there is no `structured-output:completed`
   wire event). `decode.ts` emits the chunks the `StreamProcessor` actually consumes:
   `CUSTOM name:'structured-output.start' {messageId}` -> the JSON via `TEXT_MESSAGE_CONTENT` ->
   `CUSTOM name:'structured-output.complete' {messageId, object, raw}` (same CUSTOM pattern aidx
   already uses for `aidx-ui`). The widget reads the resulting `structured-output` part. Do NOT
   depend on `useChat({ outputSchema })`: ai-client 0.16.3 `ChatClientBaseOptions` has no
   `outputSchema` field (doc-comment only); the part appears from the CUSTOM events regardless,
   and `outputSchema` would at most narrow the TS type of `part.data`.
5. The two capable harnesses use DIFFERENT mechanisms, so decode is bespoke per harness (both
   verified live):
   - claude (`--json-schema`): forces a synthetic `StructuredOutput` tool call and returns the
     object on the terminal `result` event's top-level `structured_output` field. Prose still
     streams as normal text. `decode.ts` must (a) read `result.structured_output`, and (b)
     suppress the synthetic `StructuredOutput` `tool_use` block so it is not rendered as a junk
     tool card. Cost: the forced tool adds an extra model round-trip on EVERY turn the flag is
     active, even a trivial no-tool reply (live run: `num_turns: 5`) — not "only when a tool ran".
   - codex (`--output-schema <file>`): uses OpenAI `response_format` (no synthetic tool, cleaner),
     but the ENTIRE final message becomes the JSON object — it arrives as the normal
     `agent_message`/`item.completed` whose `text` is the JSON string (verified:
     `{"message":"Hi."}`). So on codex there is no free-form prose outside the schema; the `message`
     field IS the whole answer. `codex/decode.ts` must detect the schema-constrained
     `agent_message` and route it to the structured part (and render `message` as the prose)
     rather than printing raw JSON as text.
6. Both decoders converge on the same client surface: emit the CUSTOM chunks the `StreamProcessor`
   consumes — `CUSTOM 'structured-output.start' {messageId}` -> JSON via `TEXT_MESSAGE_CONTENT` ->
   `CUSTOM 'structured-output.complete' {messageId, object, raw}` (same CUSTOM pattern as
   `aidx-ui`; NOT the unexported `appendStructuredOutputDelta`). Do NOT depend on
   `useChat({ outputSchema })`: ai-client 0.16.3 `ChatClientBaseOptions` has no such field
   (doc-comment only); the part appears from the CUSTOM events regardless.

Gating: the flag is opt-in per harness (a setting; default decided in the plan). When off, no
done card and zero overhead — the turn behaves exactly as today. The capability flag excludes
gemini-cli / opencode / pi entirely. Residual risk: the full interaction inside aidx's live turn
pipeline (permission gate, usage accounting, compaction) is not yet exercised end-to-end; the
plan makes that an early real-run task, since the isolated CLI behavior is now known but the
integration is not.

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
2. Co-locate the canonical classification with each def: a pure `classify(name, input):
ClassifiedTool` (kind, title, family, fields) exported from the tools package, browser-safe so
   the widget calls it directly. The aidx\_\* tools classify identically on every harness; the
   future client tools reuse the same function. Labels/kinds for aidx tools are defined once.
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
- Classifiers are PURE and browser-importable: the `aidx_*` classifier in `@aidx/tools`, each
  harness classifier behind a node-dep-free `@aidx/harness` classify entry. The widget imports
  them and classifies client-side (they are not run in the stream/decode).
- Renderers live in `@aidx/tool-ui` (browser/Solid; import only the `ClassifiedTool` type).
  `@aidx/widget` composes classify (active harness id) + the registry; the on-page mirror stays in
  the widget (it needs the page driver).

How to add a tool (the centralized recipe): add/confirm a `ToolKind` in `@aidx/protocol`, a
`classify` branch in `@aidx/tools`, and a renderer + story in `@aidx/tool-ui`. Three small,
obvious edits; the registry and Storybook pick it up.

## Components touched

- `@aidx/protocol`: `ToolKind`, `ClassifiedTool`, `structuredOutput` capability on
  `HarnessAdapter`, final-result schema.
- `@aidx/harness`: a pure, browser-safe classify entry (claude classifier + generic; others
  fall through), and `--json-schema`/`--output-schema` args + bespoke structured-output decode for
  claude/codex (read `result.structured_output` / route the codex `agent_message` JSON; emit the
  `structured-output.start/.complete` CUSTOM chunks; suppress claude's synthetic `StructuredOutput`
  tool). No tool-call metadata emission (classification is client-side).
- `@aidx/tools`: drop the `AidxMcpTool` re-wrap, instantiate `.server()` from the shared defs,
  co-locate the pure browser-safe `classify(name, input)` for the aidx\_\* tools, per-verb map for
  `aidx_page`.
- `@aidx/core`: `api/mcp/mcp.ts` registers tools from the def schema + `.server` instance
  directly (no `run`/re-parse indirection).
- `@aidx/tool-ui` (new): the `ToolKind` renderer registry + per-kind components, reflection card,
  now-line, done card, moved `TestCard`, moved `--pw-*` tokens, `.storybook` + stories.
- `@aidx/widget`: classify client-side (active harness id) and render via the `@aidx/tool-ui`
  registry from `PartView`, paired call+result rendering, the on-page mirror module (page DOM,
  hooked in `page-driver.execute`); `GenUi`/approval path unchanged.

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

Honest list, worst first. Items 1, 2, 4 were spiked and are now resolved (findings below and
folded into the sections above); 3, 5-7 are decisions for the plan.

1. **RESOLVED (spike) - classification carrier.** Decided: classify CLIENT-SIDE from
   `part.name` + parsed args via pure per-harness functions, selected by the active harness id the
   widget already has. The metadata carrier is dropped entirely (it could only ride
   `TOOL_CALL_START`, before claude's input exists). No decode change, no side channel, no timing
   problem. See "Classification: a pure function, run client-side".
2. **RESOLVED (spike) - history reload.** Falls out of #1: transcript tool-call parts carry
   `name` + `arguments` (`claude/history.ts:54-58`), so the same client-side classifier re-derives
   the card on reload. No persistence needed. Requirement: the per-harness classifiers must be
   pure and browser-importable (a node-dep-free entry).
3. **Interactive renderer callbacks (gap, small).** The registry `Result(call, result)` signature
   has no callback channel, but `TestCard` needs `onFix` (sends a message) and "show more"/retry
   need handlers. The signature needs a `ctx` param (actions: sendMessage, apiBase, ...) threaded
   from the widget. Straightforward but must be designed in, not bolted on.
4. **RESOLVED (spike) - structured output per harness; one residual.** Live-tested both: claude
   forces a synthetic `StructuredOutput` tool, result on `result.structured_output`, lenient
   schema, extra turn every request; codex uses OpenAI `response_format` (no synthetic tool) but
   the whole final message becomes the JSON `agent_message` and the schema must be OpenAI-strict
   (all properties required, `additionalProperties:false` — a loose schema was rejected). Decoders
   are bespoke per harness; the portable schema is all-required. Folded into the structured-card
   section. Residual (one real-run task in the plan, not a blocker): the interaction inside aidx's
   live turn pipeline (permission gate, usage, compaction) is not yet exercised end-to-end. Also
   to decide in the plan: where the on/off gating setting lives (per-session vs global).
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
