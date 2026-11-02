# Trial: an existing page matched to a re-export (CUJ 1)

## Setup

| Field        | Value                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route        | `/?variant=bordered` of the design fixture host (`packages/it/test/fixtures/design/host`)                                                                                              |
| Variant      | `bordered`: the `target` page with the table cells' bottom border recoloured to `#c2410c`                                                                                              |
| Tab width    | 1280 (viewport 1280 × 720, headless Chromium)                                                                                                                                          |
| Design image | `u1-1280.png` next to this record, 1280 × 720 at 1x: the `target` variant at 1280, rendered the way `render-targets.ts` does (`pnpm trial --render <dir>`)                             |
| Target       | id `7f458823e56c`, 1280 × 720, 16 text runs                                                                                                                                            |
| Budget       | `roundBudget` 8, `stallRounds` 2, unchanged                                                                                                                                            |
| Command line | `pnpm trial --route '/?variant=bordered' --width 1280 --image ../../docs/designs/trials/u1-1280.png --state <dir>` from `packages/it`, then `diff`, the edit, `diff`, `status`, `quit` |

## Rounds

| Round | Stage | Score `[unpaired, structure, content, geometry, paint, residual]` | Stop   | Sources | Capture path | Run time (ms)  |
| ----- | ----- | ----------------------------------------------------------------- | ------ | ------- | ------------ | -------------- |
| 0     | paint | `[0, 0, 0, 0, 90, 0]`                                             | null   | dom     | snapdom-live | (registration) |
| 1     | paint | `[0, 0, 0, 0, 90, 0]`                                             | null   | dom     | snapdom-live | 3080           |
| 2     | null  | `[0, 0, 0, 0, 0, 0]`                                              | `done` | dom     | snapdom-live | 3322           |

### Run 0 and round 1

Run 0 and round 1 carried the same brief:

1. th (src/Table.tsx:18): border is #c2410c where the design has #e3e7ed, set via css at src/styles.css:88, declared as `border-bottom-color: #c2410c`
2. th (src/Table.tsx:19): border is #c2410c where the design has #e3e7ed, set via css at src/styles.css:88, declared as `border-bottom-color: #c2410c`
3. th (src/Table.tsx:20): border is #c2410c where the design has #e3e7ed, set via css at src/styles.css:88, declared as `border-bottom-color: #c2410c`
4. td (src/Table.tsx:26): border is #c2410c where the design has #e3e7ed, set via css at src/styles.css:88, declared as `border-bottom-color: #c2410c`
5. td (src/Table.tsx:27): border is #c2410c where the design has #e3e7ed, set via css at src/styles.css:88, declared as `border-bottom-color: #c2410c`

Round 1 reported 9 deltas, all `border #c2410c → #e3e7ed`, source `dom`, confidence 1.00, every one pointing at `src/styles.css:88`; nothing unmatched.

Response: the declaration the brief named, set to the design's value.

```diff
--- a/packages/it/test/fixtures/design/host/src/styles.css
+++ b/packages/it/test/fixtures/design/host/src/styles.css
@@ -87,3 +87,3 @@ button {
 .table.bordered td {
-  border-bottom-color: #c2410c;
+  border-bottom-color: #e3e7ed;
 }
```

### Round 2

`stop: done`, empty brief, 0 deltas, 0 unmatched. `design_status` returned `done: true`, `round: 2`, `stop: done`, `score: [0, 0, 0, 0, 0, 0]`, `mismatch: 0`, `above: 0`.

## Decisions

None.

## Where the agent went wrong

Nowhere the report could have caused. One edit, the one the brief named, and the score went from `[0, 0, 0, 0, 90, 0]` to all zeros. The agent knew the fixture, which this record cannot discount; the brief alone (file, line, declaration and the design value) was enough to make the same edit.

## Defects

None found.

## Result

`stop: done` at round 2. **Pass**: `done` within the budget of 8.

Three things that would have made the loop faster:

1. One brief line per declaration: the five lines (and nine rows) are one edit at `src/styles.css:88`.
2. The run after the save already measured `stop: done` (a run triggered by the hot update, before the second `design_diff`); the round could have been read from that run instead of a fresh capture.
3. The brief could name the rule's selector (`.table.bordered th, .table.bordered td`) as well as its line, so the agent sees at once that one rule paints every cell.
