# @conciv/plugin-whiteboard

The conciv whiteboard plugin. Its engine part keeps a canvas the user and the agent share, with source-anchored
comments and pins, in the plugin's own libSQL database, and offers it to the agent and over the plugin's RPC. Its
browser part is empty for now.

Internal until the canvas ships in the widget: the package is private and not published. Until then, the old
`@conciv/extension-whiteboard` is the whiteboard users have, and the two cannot run together (with the extension
mounted, the plugin fails to load because its RPC id `whiteboard` is taken).

What enabling it gives today:

- 22 tools under the `whiteboard` namespace, in code mode as `external_whiteboard_*`: comments, pins, anchors,
  `element_reference`, and the canvas tools.
- The `whiteboard` plugin RPC: the table and element methods, `since` for the changes after a cursor, and a `changed`
  event that carries ids and a cursor only.
- The `whiteboard` skill, which guides the agent through the tools.
- When a turn finishes, a draft left on the canvas is handed to the canvas to commit.

What it does not give yet: a canvas in the widget. Drawing (`canvas_draw`, `canvas_svg`, `canvas_diagram`,
`canvas_connect`) is converted by an open canvas, so with none taking the plugin's work it answers `NO_CANVAS` after
8 seconds and draws nothing. A PNG export answers `EXPORT_TIMEOUT` for the same reason. Comments, pins, anchors, reading
the canvas, its JSON export and the edits that change stored elements directly work without a canvas.

```ts
plugins: ['@conciv/plugin-whiteboard']
```

The database lives in the project the engine runs in, at `.conciv/whiteboard/whiteboard.db`. The `stateRoot` option
and the `CONCIV_STATE_ROOT` environment variable do not apply to the whiteboard database yet: with either set, the
board is still kept under the engine's working directory.
