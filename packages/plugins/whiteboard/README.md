# @conciv/plugin-whiteboard

The conciv whiteboard plugin. Its engine part keeps a canvas the user and the agent share, with source-anchored
comments and pins, in the plugin storage the engine keeps for it, and offers it to the agent and over the plugin's RPC. Its
browser part opens the Excalidraw canvas from the "Whiteboard" pill above the composer.

The package is private and not published yet.

What enabling it gives today:

- 22 tools under the `whiteboard` namespace, in code mode as `external_whiteboard_*`: comments, pins, anchors,
  `element_reference`, and the canvas tools.
- The `whiteboard` plugin RPC: the table and element methods, `<table>.get` and `elements.get` to read one row by id,
  `since` for the changes after a cursor, and a `changed` event that carries ids and a cursor only.
- The `whiteboard` skill, which guides the agent through the tools.
- When a turn finishes, a draft left on the canvas is handed to the canvas to commit.
- The canvas: the "Whiteboard" pill opens Excalidraw over the page, with the chat still usable above it; Escape
  closes it. The open canvas converts what the agent draws (`canvas_draw`, `canvas_svg`, `canvas_diagram`,
  `canvas_connect`), replays a commit onto the shared canvas and renders PNG exports. Every open tab follows the
  board through the `changed` event, fetching each changed row by id, and catches up through `since` after a
  reconnect. It reads its position before it lists the rows, a failed `since` is read again with an exponential
  wait that starts at the `catchUpRetryMs` option (1000 ms by default), and when the event stream itself fails the
  tab reads its position and lists every table again.

The browser part also draws the thread cards for the whiteboard tools: the canvas operations (with the drawn element
types and bounds, the svg or mermaid source, and an export's image), the comment and pin operations (with the thread),
`element_reference` and `anchor_resolve`. It is a first-party definition (`defineInternalPlugin`) that draws only
through `ctx.ui`; the bundle inlines `@conciv/plugin-internal` and imports no kit.

Once opened, the canvas stays mounted and hidden after Escape, so the agent keeps drawing into it. In a tab
where the canvas was never opened, drawing answers `NO_CANVAS` after 8 seconds and a PNG export answers `EXPORT_TIMEOUT`.
Excalidraw loads its fonts from esm.sh.

```ts
plugins: ['@conciv/plugin-whiteboard']
```

```ts
plugins: [['@conciv/plugin-whiteboard', {catchUpRetryMs: 500}]]
```

The canvas is transparent so the page shows through it. The "Canvas background" row in the general settings turns
that off for a solid canvas that follows the theme. PNG exports are always white.

The board lives in the plugin storage of the engine's state root, so a second engine on that state root reads it back.
