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

How the classification reaches the widget: `ToolCallPart` is generic over `TMetadata` and
carries `metadata?: TMetadata` ("provider-specific metadata that round-trips with the tool
call, typed per-adapter" — confirmed in ai-client `types.d.ts:239`). That is the native
carrier: the harness decode (`harness/src/<h>/decode.ts`), which is the "adapter", attaches
the `ClassifiedTool` as the tool-call's `metadata`. No CUSTOM side channel, no forked types.
The widget reads `part.metadata` (the `ClassifiedTool`), never the raw name in a switch.

### 3. Widget tool-UI registry (keyed on ToolKind)

```
const toolRenderers: Record<ToolKind, {
  Icon: Component
  Result: (call: ClassifiedTool, result?: ToolResultPart) => JSX.Element
}>
```

`PartView` looks up by `kind`, renders header (icon + family rail + `title` + state) and the
kind-specific body. Unknown kinds use the generic fallback (collapsible raw args/result).
Adding a tool kind is one registry entry. The current `<Switch>/<Match>` part dispatch is kept
(reactive, no Streamdown remount); only the tool branch changes. State comes from the real
`ToolCallState` (`awaiting-input | input-streaming | input-complete | complete |
output-available | approval-requested | approval-responded`, confirmed in types.d.ts), and
approval/permission uses `part.approval` ({id, needsApproval, approved}) — which is how the
existing risky-Bash gate should converge rather than the separate GenUi approval path.

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

- `shell` -> terminal block: command + output, exit-aware coloring. Horizontal scroll at narrow width.
- `file-edit` -> diff: +N / -M counts in the header, colorized hunk in the body.
- `file-read` -> file path + line range.
- `search` -> match list with counts.
- `page-action` -> human label by verb ("Clicked X", "Typed \"...\" into Y") + element chip + on-page mirror.
- `test` -> existing `TestCard` (already wired through the runner).
- `todo` -> checklist with done/active/pending states.
- `ui` -> existing GenUi (unchanged).
- `unknown` -> label + collapsible raw args/result.

Family color rail: page = magenta accent, code = teal agent hue, test = gold, read = purple.
Uses the existing `--pw-*` design tokens in `styles.css`; no new palette.

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
before the handler runs. Seam: `packages/widget/src/page-handlers.ts` `resolveTarget(query)`
already resolves the element for every `aidx_page` action; the mirror hooks there. Reuses
react-grab's overlay infrastructure (`getBoundingClientRect` + max z-index overlay,
`react-grab/`): a new small module draws the ring at the element rect, animates a cursor glide
to it, brief pulse, then the existing handler executes. Element verbs are the `ELEMENT_KINDS`
set already defined in page-handlers. The future page agent emits the same `page-action`
shape, so it reuses this mirror with no change.

## Structured final-result card (v1, capability-gated)

A "done" card built from real structured data, not parsed prose, using @tanstack/ai's native
`structured-output` message part (`useChat({ outputSchema })` exposes a typed
`structured-output` part; confirmed in the installed ai-client `.d.ts`).

Wiring:

1. Add a `structuredOutput` capability to `HarnessAdapter` (capability-typed, per the existing
   contract). claude and codex set it; the others do not.
2. For capable harnesses, pass the schema to the CLI: claude `--json-schema <schema>`, codex
   `--output-schema <file>` (both shape the run's final response, confirmed in the CLI docs
   and `--help`). Added in `harness/src/<h>/args.ts`.
3. The schema includes a prose field so normal conversation survives, plus structured metadata:
   `{ message: string, summary?: string, filesChanged?: [...], pageActions?: [...], testsPassed?: number }`.
   The text part renders `message`; the done card renders the metadata.
4. `decode.ts` maps the CLI's final JSON to tanstack `structured-output` events
   (`appendStructuredOutputDelta` / `structured-output:completed`); the widget reads it off the
   `structured-output` part and renders the done card.
5. Harnesses without the capability skip the card entirely; the agent's normal prose ends the
   turn. No regression for gemini-cli / opencode / pi.

This is the riskiest piece because it touches the final-answer contract; it is isolated behind
the capability flag and the schema's prose field so a non-capable or schema-less turn behaves
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
- `@aidx/widget`: tool-UI registry keyed on `ToolKind`, paired call+result rendering,
  reflection card, now-line, on-page mirror module (under `react-grab/` or sibling), done card,
  `styles.css` additions using existing tokens.

## Verification

- Widget ITs in a real browser (Playwright) against the prebuilt bundle: a turn with a shell
  call, a file edit, a page action, and a test run renders the right cards; the now-line tracks
  the active call; the mirror ring appears on the target element; narrow width truncates/scrolls
  rather than overflows.
- A harness without classifiers (simulate via the stub) falls through to the generic card with
  no errors, proving harness-agnostic behavior.
- The structured final card renders for a capable harness and is absent for a non-capable one.
- `pnpm typecheck` / `pnpm build` / `pnpm test` via turbo.

## Follow-ups

- Scoped first-party page agent harness (tanstack loop + macro tool) for guaranteed structured
  reflection and zero-CLI page driving. Reuses this UI via `page-action`.
- Classifiers for the remaining harnesses (codex / gemini-cli / opencode / pi).
