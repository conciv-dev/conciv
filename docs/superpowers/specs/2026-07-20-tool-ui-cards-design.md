# Tool-UI cards for code mode, discovery, and extension ops

Date: 2026-07-20. Status: user-approved design (interactive mocks reviewed; see conversation
artifact "conciv tool-UI cards"). Follow-on to the lazy-discovery/code-mode migration
(`docs/superpowers/plans/2026-07-19-lazy-discovery-code-mode.md`).

## Goal

Every tool call conciv itself emits renders a purpose-built card. The generic fallback card
(`ToolFallback`) remains only as a safety net for unknown CLI-native tool names — never for a
tool we own. No raw `<pre>` JSON dumps for owned tools.

## Conventions (unchanged, load-bearing)

- Cards register via `ToolCardEntry {names, render}`; conciv-owned cards live in
  `@conciv/ui-kit-chat-tools` (`builtinToolCards`); extension-owned cards live in their
  extension package via `defineTool(def).render(Card)` — extensions self-describe, one-way dep.
- Card anatomy mirrors `CollapsibleCard`: icon + mono tool name + summary + duration + state
  dot + chevron. `parseInput(schema, part)` for inputs (never `part.input` — it is empty;
  args ride `part.arguments`).
- Code rendering reuses the existing shiki path from `ui-kit-chat` markdown (`Streamdown`
  langs); TypeScript highlighting for code and type stubs.
- Failure rule: a tool whose OUTPUT signals failure (e.g. `success: false`) renders the
  failure state (red icon, red dot, error surfaced) even though the tool call itself
  technically succeeded. Emit/inspect wire `ToolOutputState` where applicable.
- Motion: card expanded while running, auto-collapses when settled (motion-settled
  convention). Collapsed headers must be informative standalone.
- Chips: compact inline cloud (`inline-flex`, never stretched by a column flex parent).
  Chips carry hover/focus tooltips with description + input params rendered from the zod/JSON
  schema (`seconds: number · keyframes?: number` form). Never raw JSON schema dumps.

## Phase 1 — this branch's new tools (in `@conciv/ui-kit-chat-tools`)

### CodeRunCard — `execute_typescript`

Wire: input `{typescriptCode: string}`; output
`{success: boolean, result?: unknown, logs?: string[], error?: {message, name?, line?}}`.

- Header: code icon, title "run code", summary = first meaningful code line, duration, dot.
- Body: shiki-highlighted TypeScript; "console" section from `logs[]` (left-rule block);
  "result" chip with the return value (stringified, truncated).
- Failure (`success: false`): red icon + red dot; error box `«name»: «message» · line «line»`.
  This kills the green-dot-on-failed-script bug observed in manual testing.
- Running: expanded, pulsing accent dot; collapses on settle.

### DiscoveredApisCard — `discover_tools`

Wire: input `{toolNames: string[]}`; output
`{tools: [{name, description, typeStub}], errors?: string[]}`.

- Header: "Discovered N APIs", duration, dot.
- Body: chip cloud (accent chips, tooltip = description + params); `errors[]` as red chips
  with explanatory tooltip; expanded rows per API: description + `typeStub` highlighted as TS.

### LoadedToolsCard — `__lazy__tool__discovery__`

Wire: input `{toolNames: string[]}`; output `{tools: [{name, description, inputSchema}]}`.

- Header: "Loaded N tools", summary = comma-joined names, duration, dot.
- Body: single chip cloud; tooltip per chip = description + params derived from
  `inputSchema` properties. Full JSON schema never rendered.

### Inline chip — `conciv_extensions`

Single inline row (same treatment as Read/Grep inlines): grid icon, "Listed extensions",
summary = extension names from the result. No card.

## Phase 2 — extension-owned cards (own PR)

- **CanvasOpCard** (whiteboard, one card for `canvas.*`): op-aware. draw/svg/diagram/preview/
  export-png render the image/thumbnail from the result; read/export-json compact count chip;
  delete/clear show red op chip + the approval strip (approval part annotation from the run
  gate — the same approval that fires from code-mode bindings).
- **CommentOpCard** (whiteboard, `comment.*` + `pin.setState`): op chip + text preview +
  thread/result chip.
- Inline chips: `element.reference`, `anchor.resolve`.
- **RecordingToolCard** (recorder, `recording_start/stop/pull`): summary line
  (`last 30s · 14 actions · 4 keyframes`), body = compact action list. The existing
  `RecordingCard` is an attachment card and stays as-is; tool calls get this new card.

## Phase 3 — live console (separate design task)

Stream `code_mode:console` custom events (`{stream, text}`) into the active CodeRunCard while
the script runs. Requires correlating custom events to the running tool part on the wire —
core-side plumbing, not just UI. Out of scope for phases 1–2.

## Testing

- Storybook stories per card and state (running/success/failure), following the existing
  `*.stories.tsx` pattern in ui-kit-chat-tools.
- Widget IT (prebuilt embed, real Chromium): script a turn with `execute_typescript`
  (success and `success: false`) + `discover_tools` + `__lazy__tool__discovery__` parts and
  assert card content via native assertions (`getByText` on card titles/error text), no
  error boundary, failed run NOT rendered as success.
- No jsdom; `browser.newPage()`; never `networkidle`.
