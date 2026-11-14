# @conciv/plugin-recorder

The conciv recorder plugin, engine part. The page's rrweb events reach the engine over the plugin's RPC and are kept in
a sliding window per page client; the agent pulls a distilled action log (and keyframes rendered in a headless
Chromium) from code mode.

```ts
plugins: ['@conciv/plugin-recorder']
plugins: [['@conciv/plugin-recorder', {masking: 'inputs', windowMinutes: 10, console: true}]]
```
