# builtin-plugins/src/page/cards

## Overview

Each `*Card` is a ToolRegistry render: it takes `ToolProps` and draws a `BasicTool` row (through `PageTool` in `shared.tsx`) with the page operation's own label as its title. `page-tool-cards.ts` binds the cards to the page tool names, the page plugin registers one render per name in its setup, and each render reads its element captures through the page plugin's own captures query (`../session-captures.tsx`). `SessionCard` is the group entry for `PAGE_SESSION_GROUP_KEY` groups and reads the same captures. An errored call never reaches a card: the plugin registers `PageFailedTool` (`shared.tsx`) as each name's `errorComponent`, the error card titled with the page operation. `session-steps.ts` turns a run of page tool calls into `PageSessionStep` rows. `story.fixtures.tsx` holds the builders the stories use.

## Invariants

- `cardErrorMessage` (`shared.tsx`) returns a message only when `result.state === 'error'`; it prefers a non-empty `result.error`, then non-empty result text
- `elementTarget` (`shared.tsx`) picks the element target from the first non-empty string of `selector`, then `ref`, then `name`
- `outputChips` (`shared.tsx`) returns [] unless the payload is a plain non-array object, and it drops undefined values
- `pageSessionSteps` (`session-steps.ts`) keeps only parts whose name is in `actNames`; step state is 'error' or 'complete' from the result, otherwise 'streaming' if the group is streaming, else 'aborted'
- `stepInput` (`session-steps.ts`) falls back to JSON.parse of `part.arguments` and returns {} on parse failure
- `stepTarget` (`session-steps.ts`) uses this order: eval code first line, the fixed targets for css/eval/effect, capture accessibleName, selector/ref, input.name, then 'page'
- `clipLine` (`session-steps.ts`) truncates targets and values to `CHIP_BUDGET` = 64 chars with an ellipsis
- `pageSessionScripted` (`session-steps.ts`) is false for an empty step list
- `SessionCard` (`session-card.tsx`) renders nothing when there are zero steps; `sessionStatus` is 'running' while streaming, else 'error' if any step or result errored
- `sessionScripts` (`session-card.tsx`) excludes parts named in `PAGE_ACT_TOOL_NAMES` or prefixed with `PAGE_TOOL_PREFIX`, and keeps only inputs that have `typescriptCode`
- `sessionLocation` (`session-card.tsx`) uses the href from the latest successful `${PAGE_TOOL_PREFIX}route` result; it falls back to `location` only while streaming
- `EditLiveCard` (`edit-live-card.tsx`) has content for eval/css verbs or when a before-capture exists
- `ConsoleCard` (`console-card.tsx`) marks the row status 'error' if any entry has level 'error', 'uncaught' or 'unhandled'
- `safeColor` (`grab-snapshot-frame.tsx`) accepts only CSS values that match `/^[\w\s%.,()/#-]+$/`, else it uses a fallback, before interpolating into srcdoc
- `GrabSnapshotFrame` (`grab-snapshot-frame.tsx`) sets a CSP of `default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:` and an empty `sandbox`
- `resolvePayload` (`grab-card.tsx`) returns null on a base64 decode failure; `GrabCard` shows 'Grabbed element could not be read' when the payload is null or errored

## Side Effects

- `GrabCard` (`grab-card.tsx`) reads `attachment.file.text()` asynchronously via createResource
- `GrabSnapshotFrame` (`grab-snapshot-frame.tsx`) reads `getComputedStyle` (`--chat-panel`, `--chat-fill`) on mount and renders a sandboxed srcdoc iframe
- `sessionLocation` (`session-card.tsx`) reads global `location.host`/`location.pathname` while streaming
- Every page render and `PageSessionCard` (`session-card.tsx`) run the page plugin's captures query on the app's QueryClient, keyed exactly as the app invalidates it

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/builtin-plugins` from the repo root (turbo builds the package and its dependencies first)
