# devgent

An embeddable **AI dev agent for your running app**. A Vite plugin spawns a headless
`claude -p` loop behind a small HTTP surface, and a widget injected into the page renders
the chat thread, tool calls, approval gates, generative UI, live test results, and lets the
agent drive the real DOM.

> Status: early. Extracted from an internal preview tool and being generalized for any app.

## Packages

| Package                                          | What it is                                                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`@devgent/protocol`](./packages/protocol)       | Wire types shared by the plugin and the widget (chat, generative UI, vitest, page control). Zero framework deps.                         |
| [`@devgent/vite-plugin`](./packages/vite-plugin) | The server half: HTTP routes, `claude -p` spawn, AG-UI transcode, out-of-process vitest runner, page-control bus, and the `devgent` CLI. |
| [`@devgent/widget`](./packages/widget)           | The browser half: a React widget mounted into a Shadow DOM, talking to the plugin over SSE.                                              |

## Develop

```sh
pnpm install
pnpm build      # turbo: protocol -> plugin/widget
pnpm test       # vitest across packages
pnpm typecheck
pnpm lint        # oxlint
pnpm format      # oxfmt
```

## License

MIT
