# @conciv/plugin-recorder

The conciv recorder plugin. Its engine part keeps the page's rrweb events, which reach the engine over the plugin's RPC,
in a sliding window per page client; the agent pulls a distilled action log (and keyframes rendered in a headless
Chromium) from code mode. Its browser part adds a Recorder tab to the panel: it replays the recording live, starts a
New recording, and exports the recording as a video (Export video).

The browser part also draws the thread card for `recording_start`, `recording_stop` and `recording_pull`: the started
capture's id, or the pulled or stopped window's action list with its window, action and keyframe counts. It draws
only through `ctx.ui`, reading conciv's own members with `OpaqueUi.toInternal(ctx.ui)`, and imports no kit.

Its browser part records the page it runs in: while a recording is live (a Recorder tab is open, or the agent started
one) and the page plugin is active, it captures the page with rrweb, leaving the widget out (the page plugin's
`capture.exclude`), and flushes the events to the engine part. The tab says why nothing is recorded when the page
plugin is pending or inactive, or capture failed to start.

```ts
plugins: ['@conciv/plugin-recorder']
plugins: [['@conciv/plugin-recorder', {masking: 'inputs', windowMinutes: 10, console: true}]]
```

Saved recordings are kept per project, in `.conciv/recorder/recordings` under the project directory. The `stateRoot`
option and `CONCIV_STATE_ROOT` do not apply to recordings yet: with either set, recordings still go under the project
directory.
