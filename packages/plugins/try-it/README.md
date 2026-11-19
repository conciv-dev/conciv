# @conciv/plugin-try-it

The conciv try-it plugin, the one conciv.dev composes into its widget. It offers the widget one server: the conciv core a
visitor starts on their own machine with `npx @conciv/try --token <token>`. Until that core answers, the plugin's
`Server` entry is not ready and its cover fills the panel with the connect steps (copy the command, run it, approve
Chrome's local-network prompt). It probes `http://127.0.0.1:<port>/t/<token>/health` on every connect port every two
seconds, shows "Agent connected" for a moment once one answers, then turns the entry ready with that core's URL, and
the widget binds to it in place.

The window entry is `src/plugin-experimental.tsx`, published as the package root. Only a host composes it, with the pairing token as its option:

```ts
import {compose} from '@conciv/plugin/experimental/host'
import tryIt from '@conciv/plugin-try-it'

const plugins = compose({'try-it': {...tryIt, windowEntry: async () => ({default: tryIt.setup})}}).map(
  (entry) => [entry, {token}] as const,
)
mountConciv(plugins)
```

The definition is first-party (`defineInternalPlugin`): the host spreads it into the composed entry so the app sees the
stamp and hands the setup the internal `ctx.ui` members (`TruncatedText`, `CopyButton`, `Collapsible`) the connect pane
draws through; the bundle inlines `@conciv/plugin-internal` and imports no kit.

Options: `token` (a UUID, required), and `probeMs`, `holdMs`, `slowMs` (the sweep interval, the "Agent connected" hold
and the wait before the setup-help hint, in milliseconds).
