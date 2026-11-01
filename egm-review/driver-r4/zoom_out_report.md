# egm-zoom-out review: `docs/designs/design-driver.md`, revision 4

Standard: zoom-out-standard. Read: the document, the rulings, r3 consolidated and zoom-out reports; checked `client/components.ts`, `client/capture.ts`, `shared/config.ts`, `extension/src/define-extension.ts`. Nothing under r3 "Not adopted" re-raised.

## Verdict: changes required (0 Blockers, 9 Majors, 5 Nits)

Every r3 zoom-out blocker fixed (B1 by ruling 15, B2 by ruling 16; M1, M2, M4, M5, M6 fixed). New complexity: slice twins, heat map with predicted widths, takumi second opinion, client registry. The rulings require the first three but their data flow is undefined; the registry is required by no ruling and duplicates existing code.

## Majors

- **M1. Slices grouped by route, which ruling 2 says is never a key (53, 120, 210, 272, 456).** `route?` is optional; no route means twins undefined. Simplest: the slices are the session's targets, the grouping `store.current` and the chip already use.
- **M2. Twin voter needs another slice's design-to-component pairs; source never stated (77, 168, 196, 231, 272).** Either recompute the other slice's pairing per run (minutes, per save) or read the other target's last stored run (a persisted pair, which Non-Goals reject). Simplest: read the other slice's latest stored run; state it is the one place a stored pair is read; abstain without one.
- **M3. Carry and heat map need the mirror at more than one width (104, 228, 272, 280, 441).** Carry needs the box at the tab width: live rects at W are the cheapest source. Heat map "predicted" columns need relayouts at unnamed widths with unstated cost. Simplest: carry reads live rects at W; heat map columns are the registered widths from each target's latest run; if predicted columns stay, name the widths and cost them.
- **M4. Client registry, `GeometrySource` and `Capture` slots wrap runtime branches and existing code (201, 202, 206, 441, 444).** Choice depends on run-time facts (widths match, stream, browser, fonts), never on config; a config-selected `sources` entry cannot run takumi beside the mirror. `collectComponents({root})` (`client/components.ts:174`) already reads any document; `capture.ts:80` and `:98` call it on the frame and the live document. `define-extension.ts:70-71` gives the client factory no config argument. Simplest: no `client/registry.ts`; `measurer.ts` calls `collectComponents` on `document` or the mirror's document; capture is one function with ordered fallback; takumi a conditional call.
- **M5. Takumi built in step 3, only consumer is the overlay in step 5 (229, 307, 441–447, 465).** Five files, three catalog entries, 6.8 MiB wasm, wasm serving, font bytes, two fixture variants, two IT cases, all before anything renders the output. Simplest: own step after step 5; Alt G becomes a skippable step.
- **M6. `@chenglou/pretext` added with no consumer (136, 151, 370, 443).** Remove from item 24; add with the sweep.
- **M7. The run queue lines every save behind a pairing pass of up to minutes (225, 238, 362).** Simplest: one in flight, one pending, newer trigger replaces pending; `design_diff` awaits the newest.
- **M8. Problem section does not trace revision 4's scope (41–48 vs 58, 118–122, 229, 272, 280).** Add Problem 7: a design arrives as several images at several widths and nothing relates them; cite rulings 16 and 19 where takumi and the heat map are introduced.
- **M9. CUJ 6 agent "switches targets by name" but no tool can (122, 210, 276, 404).** Simplest: `design_target` with an already-registered image makes it current.

## Nits

- N1. Floor differs from ruling 17: "median plus 0.1" vs "1.3 times the median".
- N2. Pairing thresholds (IoU 0.3, 3x, 0.6, 0.08, 0.15, 0.1, 0.3) spelled out in §3 and absent from item 35; move to `tolerances.ts`.
- N3. `disagreement` used three ways (229, 447, 465).
- N4. Ruling 19's second half missing: when twin link and direct link disagree, show it.
- N5. Per-run `snapshot` plus `rebuildIntoSandboxedIframe` is cheaper than continuous `record` plus Replayer and avoids the `rrweb` catalog entry and recorder migration; ruling 3's "kept current by mutations" may be about freshness, not mechanism. Ask the owner.

## Keep as is

Measurement in `client.ts`; OCR, segmentation, pixel compare in the server; flat list; rounds on `design_diff`; `unbuilt`/`extra` informational while the page renders; aligner, estimator, loop policy, store as plain functions; decisions as the only persisted state; takumi out of score and brief; `Matcher` and `GeometryEstimator` deleted.
