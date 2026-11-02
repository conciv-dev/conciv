# Trial: a tab wider than the design (CUJ 3)

## Setup

| Field        | Value                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route        | `/?variant=shifted` of the design fixture host (`packages/it/test/fixtures/design/host`)                                                                                              |
| Variant      | `shifted`: the `target` page with the first toolbar button reading "Make" instead of "Export"                                                                                         |
| Tab width    | 1392 (viewport 1392 × 720, headless Chromium); the design is 1280                                                                                                                     |
| Design image | `u1-1280.png` next to this record, 1280 × 720 at 1x: the `target` variant at 1280, rendered the way `render-targets.ts` does (`pnpm trial --render <dir>`)                            |
| Target       | id `7f458823e56c`, 1280 × 720, 16 text runs                                                                                                                                           |
| Budget       | `roundBudget` 8, `stallRounds` 2, unchanged                                                                                                                                           |
| Command line | `pnpm trial --route '/?variant=shifted' --width 1392 --image ../../docs/designs/trials/u1-1280.png --state <dir>` from `packages/it`, then `diff`, the edit, `diff`, `status`, `quit` |

## Rounds

| Round | Stage   | Score `[unpaired, structure, content, geometry, paint, residual]` | Stop   | Sources | Capture path   | Run time (ms)  |
| ----- | ------- | ----------------------------------------------------------------- | ------ | ------- | -------------- | -------------- |
| 0     | content | `[0, 0, 10, 0, 0, 0.0348]`                                        | null   | mirror  | snapdom-mirror | (registration) |
| 1     | content | `[0, 0, 10, 0, 0, 0.0348]`                                        | null   | mirror  | snapdom-mirror | 3096           |
| 2     | null    | `[0, 0, 0, 0, 0, 0]`                                              | `done` | mirror  | snapdom-mirror | 3410           |

Every run reported `sources: [mirror]` and `capturePath: snapdom-mirror`. The one row of the trial says `source: mirror`.

### Run 0 and round 1

Run 0 and round 1 carried the same brief:

1. button (src/Toolbar.tsx:6): change the text from Make to Export at src/Toolbar.tsx:6

Round 1's only row: `text Make → Export`, source `mirror`, confidence 0.50, nodes `a15b8545,db864336`, path `/2/1/1/1`, `src/Toolbar.tsx:6`. Nothing unmatched.

Response: the text the brief named.

```diff
--- a/packages/it/test/fixtures/design/host/src/Toolbar.tsx
+++ b/packages/it/test/fixtures/design/host/src/Toolbar.tsx
@@ -5,3 +5,3 @@ export function Toolbar(props: ToolbarProps) {
       {props.shifted ? (
-        <button type="button">Make</button>
+        <button type="button">Export</button>
       ) : props.spanColor === undefined ? (
```

### Round 2

`stop: done`, empty brief, 0 deltas, 0 unmatched. `design_status` returned `done: true`, `round: 2`, `stop: done`, `score: [0, 0, 0, 0, 0, 0]`, `mismatch: 0`, `above: 0`.

Neither report nor brief asked for the tab to be resized; the tab stayed 1392 wide throughout.

## Decisions

None.

## Where the agent went wrong

Nowhere the report could have caused. One edit, the one the brief named. The agent knew the fixture; the brief alone (file, line, both strings) was enough to make the same edit.

## Defects

None found. The text row's confidence is 0.50 through the mirror; it did not change what the agent did.

## Result

`stop: done` at round 2. **Pass**: `done` within the budget of 8, every row from the mirror, no resize asked.

Three things that would have made the loop faster:

1. The run after the save already measured `stop: done`; reading it would have saved the second capture.
2. Round 1 repeated run 0's brief and score exactly; with no edit between them, `design_target`'s brief was already the round to act on.
3. The residual share of 0.0348 in run 0 and round 1 cleared with the text edit; a line saying which rows the residual tiles sit under would tell the agent that one edit clears both.
