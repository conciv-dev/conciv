# Page-session card mockup (issue #413)

Approved visual reference for the aggregated page-session tool card: browser-chrome card with a
step rail and a midscene-style replay (camera pan/zoom + pointer + click ripple over real
per-action Chromium screenshots that crossfade between steps).

Screenshots are NOT committed — the mockup regenerates in ~30s:

```bash
node docs/assets/page-session-card-spike/capture.mjs
node docs/assets/page-session-card-spike/build-spike.mjs
open docs/assets/page-session-card-spike/page-session-card-spike.html
```

- `fake-form.html` — the light demo page the "AI" fills (viewed at 800×520).
- `capture.mjs` — drives the form in headless Chromium via the repo's Playwright, screenshots after
  every action (@2x JPEG) and records each target's bounding box → `capture.json`.
- `build-spike.mjs` — compiles `capture.json` into the self-contained mockup page (three exhibits:
  replay, collapsed poster, streaming ledger).

Generated files (`capture.json`, `page-session-card-spike.html`) are gitignored. A hosted copy of
the generated page may exist as a Claude artifact, but this directory is the durable source.
