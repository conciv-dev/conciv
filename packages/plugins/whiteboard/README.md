# @conciv/plugin-whiteboard

The conciv whiteboard plugin. A canvas the user and the agent share, with source-anchored comments and pins, kept in
the plugin's own libSQL database.

```ts
plugins: ['@conciv/plugin-whiteboard']
```

The database lives in the project the engine runs in, at `.conciv/whiteboard/whiteboard.db`. The `stateRoot` option
and the `CONCIV_STATE_ROOT` environment variable do not apply to the whiteboard database yet: with either set, the
board is still kept under the engine's working directory.
