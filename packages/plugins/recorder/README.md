# @conciv/plugin-recorder

The conciv recorder plugin. Its engine part keeps the page's rrweb events, which reach the engine over the plugin's RPC,
in a sliding window per page client; the agent pulls a distilled action log (and keyframes rendered in a headless
Chromium) from code mode. Its browser part adds a Recorder tab to the panel: it replays the recording live, starts a
New recording, and exports the recording as a video (Export video).

Not shipped yet: capture in the page. Until it lands, the old `@conciv/extension-recorder` is what records the page.

```ts
plugins: ['@conciv/plugin-recorder']
plugins: [['@conciv/plugin-recorder', {masking: 'inputs', windowMinutes: 10, console: true}]]
```

Saved recordings are kept per project, in `.conciv/recorder/recordings` under the project directory. The `stateRoot`
option and `CONCIV_STATE_ROOT` do not apply to recordings yet: with either set, recordings still go under the project
directory.
