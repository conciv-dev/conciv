# page/src/client/cards

## Overview

Each `*Card` `ToolCardView` pairs a `render` component built on `CardShell` from `@conciv/ui-kit-chat/tools` with a `hasEmbeddedBody` predicate. `src/client/bodies.ts` imports these views, and `src/client.tsx` wires `SessionCard` (a group renderer for `PAGE_SESSION_GROUP_KEY` groups) and `GrabCard` (an attachment card). `shared.tsx` holds the common payload, error and chip helpers. `session-steps.ts` turns a run of page tool calls into `PageSessionStep` rows, and `client.tsx` re-exports it. `story.fixtures.ts` provides part, result and ctx builders that the `*.stories.tsx` files and `test/page.solid.browser.test.tsx` both use.

## Interface

- `actCard` / `ActCard` (`act-card.tsx`): card for act verbs; shows the `capture.after` ElementPreview, a MirrorRow when `meta.mirrors`, and an ErrorBlock
- `consoleCard` (`console-card.tsx`): card that renders `{entries:[{level,ts,text}]}` as a timestamped log list, with a JsonTree fallback
- `editLiveCard` (`edit-live-card.tsx`): card for live edits; shows a CodeBlock for `eval`/`css` verbs, or before/after ElementPreview Tabs plus a descriptor DiffBlock
- `effectCard` (`effect-card.tsx`): card that renders a single `{effect,enabled}` or a list `{effects:[...]}` with on/off StatusDots
- `reactCard` / `ReactCard` (`react-card.tsx`): card that shows React component name/source location and per-component render-count chips from a `{components,note}` payload
- `readBulkCard` / `ReadBulkCard` (`read-bulk-card.tsx`): card that renders `{html}` via PageHtmlBlock, `{nodes}` via A11yNodeList, or `{count,elements}` as a match count plus JsonTree
- `readValueCard` / `ReadValueCard` (`read-value-card.tsx`): card that renders an error, a result image, a JsonTree for object payloads, or value chips
- `SessionCard` (`session-card.tsx`): GroupRenderProps renderer that folds a page-session group into one ToolCard with a header (title, action count, URL, acting/mutating state), a step rail, a collapsible reasoning/script section, and the last error
- `pageSessionSteps`, `pageSessionScripted`, `PageSessionStep` (`session-steps.ts`): derive per-call {verb,target,namedTarget,value,state} rows from tool-call parts; true when every step is eval/css/effect
- `GrabCard` (`grab-card.tsx`): attachment card that decodes a GrabPayload and shows a dom/image preview, a source label, and a Dialog with a toggle between snapshot and agent text
- `GrabSnapshotFrame` (`grab-snapshot-frame.tsx`): renders grabbed HTML inside a sandboxed iframe in an SVG foreignObject
- `toolInput`, `resultChips`, `ChipRow`, `cardPayload`, `cardErrorMessage`, `hasPayloadOrError`, `elementChip`, `mutatingBadge`, `ELEMENT_TARGET_KEYS`, `QUIET_TEXT_CLASS`, `LIST_ROW_CLASS` (`shared.tsx`): shared card helpers and class constants
- `storyCtx`, `storyPart`, `storyResult`, `storyErrorResult`, `storyAddResult`, `STORY_FRAME_CLASS` (`story.fixtures.ts`): fixture builders used by the stories and by test/page.solid.browser.test.tsx
- Storybook stories under `Extensions/Page/tool/*` (`*.stories.tsx`): ActCard, ConsoleCard, EditLiveCard, EffectCard, GrabCard, ReactCard, ReadBulkCard, ReadValueCard, SessionCard

## Invariants

- `cardErrorMessage` (`shared.tsx`) returns a message only when `result.state === 'error'`; it prefers a non-empty `result.error`, then non-empty result text
- `elementChip` (`shared.tsx`) picks the element target from the first non-empty string of `selector`, then `ref`, then `name`
- `resultChips` (`shared.tsx`) returns [] unless the payload is a plain non-array object, and it drops undefined values
- `pageSessionSteps` (`session-steps.ts`) keeps only parts whose name is in `actNames`; step state is 'error' or 'complete' from the result, otherwise 'streaming' if the group is streaming, else 'aborted'
- `stepInput` (`session-steps.ts`) falls back to JSON.parse of `part.arguments` and returns {} on parse failure
- `stepTarget` (`session-steps.ts`) uses this order: eval code first line, the fixed targets for css/eval/effect, capture accessibleName, selector/ref, input.name, then 'page'
- `clipLine` (`session-steps.ts`) truncates targets and values to `CHIP_BUDGET` = 64 chars with an ellipsis
- `pageSessionScripted` (`session-steps.ts`) is false for an empty step list
- `SessionCard` (`session-card.tsx`) renders nothing when there are zero steps; `sessionStatus` is 'running' while streaming, else 'error' if any step or result errored
- `sessionScripts` (`session-card.tsx`) excludes parts named in `PAGE_ACT_TOOL_NAMES` or prefixed with `PAGE_TOOL_PREFIX`, and keeps only inputs that have `typescriptCode`
- `sessionLocation` (`session-card.tsx`) uses the href from the latest successful `${PAGE_TOOL_PREFIX}route` result; it falls back to `location` only while streaming
- `editLiveCard.hasEmbeddedBody` (`edit-live-card.tsx`) is true for eval/css verbs, when a before-capture exists, or on error
- `readValueCard.hasEmbeddedBody` (`read-value-card.tsx`) is false when the result carries an image URL and there is no error
- `ConsoleCard` (`console-card.tsx`) marks the card status 'error' if any entry has level 'error' or the result errored
- `safeColor` (`grab-snapshot-frame.tsx`) accepts only CSS values that match `/^[\w\s%.,()/#-]+$/`, else it uses a fallback, before interpolating into srcdoc
- `GrabSnapshotFrame` (`grab-snapshot-frame.tsx`) sets a CSP of `default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:` and an empty `sandbox`
- `resolvePayload` (`grab-card.tsx`) returns null on a base64 decode failure; `GrabCard` shows 'Grabbed element could not be read' when the payload is null or errored

## Side Effects

- `GrabCard` (`grab-card.tsx`) reads `attachment.file.text()` asynchronously via createResource
- `GrabSnapshotFrame` (`grab-snapshot-frame.tsx`) reads `getComputedStyle` (`--chat-panel`, `--chat-fill`) on mount and renders a sandboxed srcdoc iframe
- `sessionLocation` (`session-card.tsx`) reads global `location.host`/`location.pathname` while streaming
- `SessionCard` (`session-card.tsx`) reads `useToolCtx().captureFor` from Solid context

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-page` from the repo root (turbo builds the package and its dependencies first)
