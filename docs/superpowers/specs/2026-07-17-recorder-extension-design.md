# Recorder extension (rrweb session recording)

Date: 2026-07-17
Status: design, approved in brainstorm

## Goal

Give the agent (and the user) a recording of what happened in the host app: user
interactions, agent-driven page actions, DOM changes, errors. Recording is captured with
rrweb in the host page, kept in a sliding window on the extension server, and consumed by
the agent as a distilled semantic action log plus keyframe screenshots. The user gets a
real scrubber replay in a widget panel.

Use cases, all served by one capture core:

1. **Flight recorder** — always-on sliding window; agent or user pulls "what just
   happened" after a bug or crash, with no start/stop ceremony.
2. **Agent self-verify** — agent brackets its own page actions with start/stop and
   reviews what actually rendered.
3. **User shows agent** — user reproduces a flow, then sends the window to the chat from
   the replay panel.

## Placement

New extension `packages/extensions/recorder`, mirroring the terminal extension shape:

```
src/client.tsx   defineExtension({name, configSchema, views}).client(...)
src/client/      capture (rrweb.record), flusher, recorder store, replay panel view
src/server.ts    .server(...) — ring buffer, distiller, renderer registry, oRPC router, tools
src/shared/      protocol types: RecordingWindow, ActionLogEntry, Keyframe, config schema
```

The `.client()` factory runs at widget boot, so capture starts immediately — panel
visibility is irrelevant to recording. All client↔server transport is the extension
oRPC router (`ext-rpc.ts` contract): mutations for flush, queries for windows, an
`eventIterator` subscription for live-tailing in the panel.

## Data flow

1. **Capture (client).** `rrweb.record()` on the host document, masking per config.
   Events accumulate in a small client buffer. Console error capture via the rrweb
   console plugin when enabled.
2. **Flush (client → server, adaptive cadence).** One transport, one code path, a
   cadence knob:
   - _Idle (flight recorder):_ batch flush every ~5s, plus immediate flush on
     `error`, `unhandledrejection`, `beforeunload`, and `visibilitychange:hidden` — so
     the crash-triggering events beat the crash to the server.
   - _Active (marked capture running, or panel live-tailing):_ cadence drops to
     per-batch (~100–250ms), effectively live streaming.
3. **Ring buffer (server).** In-memory, per session, bounded by `windowMinutes`
   (default 10) and a hard byte cap; drops oldest first. Survives page reloads (a reload
   appears in the log as a marker at the new-full-snapshot boundary). No disk
   persistence in v1.
4. **Consume.** A tool call or the panel requests a window `[t1, t2]`:
   - **Distiller** turns rrweb events into a semantic action log.
   - **Renderer** produces keyframe PNGs for selected timestamps.
5. **Deliver.** Tools return action-log text plus keyframe images through the existing
   extension image-result path. The panel replays the raw events in rrweb-player
   (scrubbable, video-like) and can send a selected range to the chat.

## Tool surface

Three explicit, self-describing tools (no action-enum multiplexing):

- `recording_start` — begin a marked capture; flips flush to live cadence. Returns a
  capture id.
- `recording_stop` — end the marked capture; returns action log + keyframes for that
  window.
- `recording_pull` — flight-recorder access; `{secondsBack?, keyframeCount?}` → action
  log + keyframes from the sliding window. Works anytime.

## Distiller

Pure functions on the server, unit-testable in node. rrweb events →
`ActionLogEntry[]`:

- clicks: target role + accessible name (fallback selector)
- inputs: field label; typed value only when masking is `none`
- navigations (URL changes), page-reload markers
- scrolls, coalesced into ranges
- console errors / unhandled rejections (when console capture is on)

Entries carry timestamps relative to window start so the agent can ask the renderer for
keyframes at interesting moments.

## Renderer (pluggable)

```ts
type KeyframeRenderer = {
  render(events: RrwebEvent[], timestamps: number[]): Promise<Keyframe[]>
}
```

- **v1 impl: server-side replay.** Lazily imported `playwright-core` launches headless
  Chromium, loads a local replay harness page with rrweb-player, seeks to each
  timestamp, screenshots. Pixel-accurate, no impact on the live page.
- **Degradation.** Renderer unavailable (no Chromium) or failing → tools return the
  action log only, with an explicit note that keyframes were skipped. Never an error to
  the agent.
- **Later impls, same interface:** in-browser SVG-foreignObject rasterize (zero server
  deps, partial fidelity); record-time `getDisplayMedia` frames; native OS window
  capture per the spike in `2026-06-17-native-window-capture-design.md` (true pixels,
  no permission prompt when the dev host holds the Screen Recording grant).

## Config

Extension `configSchema` (zod), host-app developer decides:

- `masking: 'none' | 'inputs' | 'sensitive'` — default `'none'` (dev tool on the
  developer's own app). `'inputs'` = rrweb `maskAllInputs`; `'sensitive'` = passwords
  and rrweb's sensitive-field defaults only. Password fields are always masked
  regardless of setting.
- `windowMinutes: number` — sliding-window length, default 10.
- `console: boolean` — capture console errors, default true.

Nothing else in v1.

## Panel (user-facing view)

One extension view: rrweb-player over the current window, scrub/play, range selection,
and "send to agent" which attaches the selected range (distilled the same way as tool
output) to the chat composer. Shows a clear degraded state when capture failed to start.

## Error handling

- Capture init failure (CSP, exotic DOM): extension degrades visibly in the panel;
  never throws into the host page.
- Flush failure: retry with backoff; client buffer is capped and drops oldest.
- Ring memory: byte-capped in addition to time-capped.
- Reload: recording restarts with a fresh full snapshot; windows stitch across the
  boundary with a "page reloaded" log marker.

## Testing

- Distiller: node unit tests over recorded fixture event streams.
- End-to-end: `@conciv/extension-testkit` in real Chromium — drive interactions on a
  test page, call `recording_pull`, assert action-log entries and that keyframes are
  non-empty PNGs of the right dimensions. No `networkidle` waits.
- Renderer: integration test that a fixture stream renders a keyframe at a requested
  timestamp.

## Dependencies (require approval before implementation)

- `rrweb` (record), `rrweb-player` (replay panel + render harness), rrweb console
  plugin.
- `playwright-core` — lazy, renderer-only.

## Out of scope (v1)

- Disk persistence of recordings.
- Video (mp4/webm) encoding — keyframes + panel replay cover the need.
- In-browser rasterize / getDisplayMedia / native-capture renderer impls (interface
  accommodates them).
- User-facing record start/stop button (panel range-select + `recording_pull` cover it;
  a button is a thin later addition).
