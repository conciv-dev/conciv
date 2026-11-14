# @conciv/plugin-recorder

The conciv recorder plugin, engine part. The page's rrweb events reach the engine over the plugin's RPC and are kept in
a sliding window per page client; the agent pulls a distilled action log (and keyframes rendered in a headless
Chromium) from code mode.

```ts
plugins: ['@conciv/plugin-recorder']
plugins: [['@conciv/plugin-recorder', {masking: 'inputs', windowMinutes: 10, console: true}]]
```

Saved recordings are kept per project, in `.conciv/recorder/recordings` under the project directory. The `stateRoot`
option and `CONCIV_STATE_ROOT` do not apply to recordings yet: with either set, recordings still go under the project
directory.
