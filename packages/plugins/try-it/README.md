# @conciv/plugin-try-it

The conciv try-it plugin, the one conciv.dev composes into its widget. It offers the widget one server: the conciv engine a
visitor starts on their own machine with `npx @conciv/try --token <token>`. Until that engine answers, the plugin's
`Server` entry is not ready and its cover fills the panel with the connect steps (copy the command, run it, approve
Chrome's local-network prompt). It probes the open path `http://127.0.0.1:<port>/health` on every connect port every two
seconds, shows "Agent connected" for a moment once one answers, then turns the entry ready with that engine's URL, and
the widget binds to it in place.

The window entry is `src/plugin-experimental.tsx`, published as the package root. Only a host composes it, with the pairing token as its option, as conciv.dev does
(`apps/site/src/lib/mount-live-widget.ts`, with `host` = `@conciv/frontend-plugin-api/host` and `embed` = `@conciv/app`):

```ts
const plugins = host
  .compose({
    'try-it': {...tryIt.default, windowEntry: async () => ({default: setup})},
  })
  .map((entry): PluginEntry => [entry, {token}])
await embed.mountConciv(plugins)
```

The connect pane draws through conciv's own `ctx.ui` members (`TruncatedText`, `CopyButton`, `Collapsible`), read with
`OpaqueUi.toInternal(ctx.ui)`; the bundle imports no kit.

Options: `token` (a UUID, required), and `probeMs`, `holdMs`, `slowMs` (the sweep interval, the "Agent connected" hold
and the wait before the setup-help hint, in milliseconds).
