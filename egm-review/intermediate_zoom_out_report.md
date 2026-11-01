# Stage 8: Intermediate Zoom Out Report

**Target:** `docs/superpowers/specs/2026-11-01-design-text-layer.md` (lines 1-341, unedited since Stage 5)

| Reviewer       | Status    |
| -------------- | --------- |
| `egm-zoom-out` | completed |

Only findings not recorded in Stages 5-7.

### 1. One rule closes most earlier blockers; the proposed mitigations build a second pipeline - Blocker

Lines 38, 94, 102, 112, 172; items 15, 18, 19. Masking every live glyph box and every target run unconditionally (line 94) is the root of B1, B3, M2, M5 and comprehension #1/#7. Replace with: **mask only text both sides have and agree on.** Group live glyph runs with target runs once per diff before the tile pass; only groups with equal strings go on the ignore list; everything else stays in pixels as today. Consequences: a changed label keeps its pixels and trips the existing gate, so the existing pair and delta path runs and the `text` delta only explains the mismatch (B1 closed); an old target has no runs so nothing is masked (M2 closed, line 172 true); placeholders, pseudo-element content, text in images and icon fonts are one-sided and stay in pixels (B3 closed, line 38 true); an OCR miss falls back to pixels (comprehension #7 closed); a reader failure yields `[]` and today's behavior (M5's `text: 'none'` unnecessary). Delete the `live: ''` and `target: ''` branches on line 102. Cost: one-sided text can still trip the gate on rasterization noise, which is today's behavior and a stated blind spot.

### 2. `ownMismatch` is not needed for #659 - Major

Line 30, 96, CUJ 4, 112; items 6, 15, 16, 17, 18. Once button noise is masked the buttons fall below `tileGate`, the header has no reported children, and the existing filter (`deltas.length > 0 || children === 0`) keeps it with `deltas: []`. `ownMismatch` addresses a different case (container and child both really changed) and brings the circular definition. Drop it; if the other case matters it gets its own change.

### 3. Keep the denominator; M6 and its constant disappear - Major

Line 94; items 6, 14. Count ignored pixels as equal over the full tile area. `mismatch` keeps its meaning, `tileGate` its value, no minimum-area constant, no schema redescription.

### 4. The false `foreground` is a bug in `foregroundColor`; fix it there - Major

Line 19, 29, 106-108; items 14, 21, 22. `raster.ts:151-155` takes the median of Sobel edge pixels, which are anti-aliased blends by construction. Pick pixels by distance from the background median the function already computes (cutoff reusing `colorDeltaE`). Fixes every caller including `textLeaf` in deltas.ts:50-52 with no glyph boxes or OCR. Can ship alone, first.

### 5. M1's offset mitigation cannot work at measured OCR precision - Major

Lines 23, 39, 132-133. Trimmed OCR edges: 3.0px median, 8.2px max error; `blurRadius` 1. A 4px move is inside OCR noise. Do not build it; keep the blind spot; remove the 4px-card argument from line 23 and the rejection of Alternative A.

### 6. The premise holds only if OCR is an agreement test, not the centerpiece - Major

Lines 11, 27-28, 33, 135-139. After findings 1-4: consequence 1 is fixed without OCR; consequence 2 follows from 3; consequence 3 needs an agreement test for masking. OCR supplies that test plus readable `text` strings. Defend it directly against Alternative B's ink-overlap test in that narrower role. Recommended order: ship finding 4, then the agreement-masked layer.

### 7. Mitigations to decline - Nit

Decline: a text pass over every component outside the matcher; collecting placeholders/input values/pseudo-element content and icon-font detection; `text: 'none'`; minimum unmasked area; group-offset geometry deltas; redefining "reported child". Keep: M3 (one real Figma export), M4 (translate target runs by `targetBox - liveBox`), M7 (evidence out of the scratchpad), vendor models unconditionally, 1 thread.

## Altitude verdict

Passes context sufficiency; does not yet pass Simplicity or Root Problem Focus. Three root-level choices remove most of the Stage 5-7 machinery: mask only text both sides have and agree on; fix `foregroundColor` in place; keep the denominator and drop `ownMismatch`. OCR then holds in a narrower role: the agreement test that lets target-side text be masked, plus `text` deltas.
