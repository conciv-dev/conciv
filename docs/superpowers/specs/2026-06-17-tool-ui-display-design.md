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

Inspiration: alibaba/page-agent (the "GUI agent living in your webpage") and assistant-ui's
tool-ui registry pattern, adapted to aidx's Solid + @tanstack/ai-client thread.

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

v1 implements: claude's tools + the aidx_* tools + the generic fallback. codex / gemini-cli /
opencode / pi fall through to generic until their classifiers are added (they still render,
just without the rich per-kind body).

How the classification reaches the widget: the harness decode (`harness/src/<h>/decode.ts`)
already turns the CLI stream into AG-UI tool-call events. It attaches the `ClassifiedTool`
to the emitted tool-call so the widget receives canonical data alongside the raw name. The
exact carrier (an AG-UI field vs a side map keyed by tool-call id) is settled in the plan;
the contract is that the widget reads `ClassifiedTool`, not raw names.

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
(reactive, no Streamdown remount); only the tool branch changes.

## Pairing call + result into one card

Today a `tool-call` part and its `tool-result` part render as two blocks. Generalize the
existing `resultByCallId` seam (from `analyzeTests`) to the whole message: build a map of
result-by-callId, render each call card with its paired result inline, and hide the standalone
result part (as `hiddenResultIds` already does for tests). One card per action.

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

## Components touched

- `@aidx/protocol`: `ToolKind`, `ClassifiedTool`, `structuredOutput` capability on
  `HarnessAdapter`, final-result schema.
- `@aidx/harness`: per-adapter `classifyTool` (claude + shared aidx_* default + generic),
  `--json-schema`/`--output-schema` args for claude/codex, decode mapping to structured-output
  and classified tool calls.
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
