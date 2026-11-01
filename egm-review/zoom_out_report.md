# Stage 5: Initial Zoom Out Report

**Target:** `docs/superpowers/specs/2026-11-01-design-text-layer.md` (lines 1-341)

## Reviewer Status

| Reviewer       | Status    |
| -------------- | --------- |
| `egm-zoom-out` | completed |

**Verdict:** does not pass yet. Context sufficiency passes. The text mask removes the signals CUJ 3 and the rejection of Alternative A depend on, and nothing brings them back.

## Prioritized Findings

### Masking text hides recolors and same-width label changes - Severity: Blocker

- **Affected Scope:** lines 61-65 (CUJ 3), 94, 102, 108; plan items 15 and 18 (lines 264-282)
- **Discrepancy:** Two code paths only act when `mismatch >= tileGate`: `matchPairs` in `server/matchers/tile.ts:109-115` only looks inside a component when its mismatch reaches the gate, and `diffStep` in `tool/steps/diff.ts:185` measures deltas only for pairs at or above the gate. Under the ignore list a recolored label's differing pixels all sit inside glyph boxes, so the button's mismatch drops to 0, no pair is created, no `foreground` or `text` delta is computed. CUJ 2 likely passes only because `Download` widens the button.
- **Recommendation:** State which layer decides that text disagreement is a reason to look inside a component and measure it: pairs whose glyph runs and target runs disagree (string or core color) count as not equal in the matcher, or text and foreground deltas run on every pair with runs regardless of mismatch.

### The design repeats the flaw used to reject Alternative A - Severity: Major

- **Affected Scope:** lines 23, 39, 132-133
- **Discrepancy:** A card moved 4px on a flat background is visible only through text. The ignore list drops those pixels; the string match still overlaps by more than half; the card's mismatch stays below the gate so `targetBox = liveBox` (tile.ts:95) and the geometry estimator never runs.
- **Recommendation:** Detect position differences between matched run groups (live glyph group box against OCR group box), or move text-only moves into Non-Goals.

### A parallel text store instead of the target node tree - Severity: Major

- **Affected Scope:** lines 80, 212, 252
- **Discrepancy:** `TargetNode` already has `kind: 'text'` and `text`; `TargetNodeSchema` already persists them; the image adapter yields a root with no children. A separate `TargetModel.text` adds a second source the Figma follow-up would have to duplicate.
- **Recommendation:** Store OCR runs as text-kind child nodes of `root`. No new model field, no `ModelSchema` change.

### Item 22 (color enricher) is not needed - Severity: Major

- **Affected Scope:** lines 299-302
- **Discrepancy:** `TargetNode.fills` is written by `colorEnricher` and read nowhere; target colors for deltas come from `sampledFills` at diff time. For image targets the enricher runs on `root` only.
- **Recommendation:** Drop item 22 and the open choice about enrichment order.

### `ownMismatch` in the matcher depends on a diff-step decision - Severity: Major

- **Affected Scope:** lines 96, 267, 282
- **Discrepancy:** "Reported children" is decided in `diffStep` and depends on deltas; the matcher cannot know deltas; the definition is circular.
- **Recommendation:** Define "reported child" in matcher terms (child `mismatch >= tileGate` or text disagreement), or compute `ownMismatch` in `diffStep` and keep `Pair` free of it.

### A heavy dependency for a goal beyond the bug - Severity: Major

- **Affected Scope:** Goals lines 28, 32; lines 86-90, 169
- **Discrepancy:** #659 is about false positives. Reading what the text says is a new capability costing about 200MB of node_modules per consumer (onnxruntime-web 145MB, @napi-rs/canvas 28-36MB, opencv-js 15MB), a native prebuilt, and file-path imports of ppu internals. Alternative B (edge band plus glyph-core color, no dependency) is dismissed in one line.
- **Recommendation:** Say why B is not enough for #659, or state label changes as a hard requirement with a real case in The Problem.

### Open question already answered by the spike - Severity: Nit

- **Affected Scope:** lines 45, 204-207
- **Discrepancy:** results.md line 603: ppu downloads models from huggingface into `~/.cache` by default; the spike passed vendored buffers from `models/ppu/`.
- **Recommendation:** Make `models/` unconditional; delete the open question.

### Worker threads on contradicts the speed argument - Severity: Nit

- **Affected Scope:** line 88 vs lines 157, 170
- **Recommendation:** Default to 1 thread, as the spike recommends; speed was declared not needed.

### Helpers that partly exist - Severity: Nit

- **Affected Scope:** item 14, line 262
- **Discrepancy:** `erode` is `expand({box, by: -1})` (tile.ts:6); `coreColor` is `medianColor({raster, exclude})` with the complement mask; `ignoreMask` repeats the box-fill loop in `unmatched.ts:16-27` `zeroed`.
- **Recommendation:** Move `expand` to raster.ts and reuse; one box-to-mask helper used in both places.

### Bookkeeping that adds nothing - Severity: Nit

- **Affected Scope:** lines 190, 224-227, 312
- **Recommendation:** Group the 27 items into the seven commits; drop item 7 ("No change"); leave fixture CSS out of the plan.

## Checked and fine

- Single-value `text` enum matches `geometry`, `color`, `capture`, `matcher` in `shared/config.ts`.
- Filling the existing `TextReader` slot reuses existing structure.
- Live glyph runs extend the existing `Range`-based `measureTextBox` in `client/components.ts`.
