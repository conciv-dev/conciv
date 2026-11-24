# @conciv/plugin-host

Internal to `@conciv/core`: the engine-side plugin host, in Effect.

## The graph

Each service has a `node` (`src/core/effect/layer-node.ts`, opencode's `util/src/effect/layer-node.ts`; the tags are
opencode's `app-node.ts`). A service the embedder supplies (location, sessions, models, servers, bundler, editor,
configured plugins, permissions and policies, instruction entries, permission sessions, `Global`) is an unbound node.
`Instance.layer({replacements})` (`src/core/instance.ts`, as opencode's `core/src/instance.ts`) compiles the one graph
with the given replacements (`X.node.replace(layer)`); building it fails on an unbound node nobody replaced. The
supervisor is not in the graph: core builds `PluginSupervisor.layer` into its own scope, so it can start and close the
plugins at its own point in the engine's start and stop.

## Observability

The engine's Effect spans (`Effect.fn` and `Effect.withSpan`) and Effect logs are exported over OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, as opencode does (`src/util/observability.ts`). With it unset nothing is exported.

- `OTEL_EXPORTER_OTLP_ENDPOINT`: the collector's base URL; traces go to `<endpoint>/v1/traces`, logs to `<endpoint>/v1/logs`.
- `OTEL_EXPORTER_OTLP_HEADERS`: `key=value` pairs, comma separated, sent with every export (for example an auth header).
- `OTEL_RESOURCE_ATTRIBUTES`: `key=value` pairs, comma separated and URI encoded, added to the resource. The `conciv.*` and `service.instance.id` attributes cannot be overridden.

Every engine Effect log line is written to a log file, whether or not an endpoint is set, as opencode does (`src/util/observability/logging.ts`); nothing is printed to the terminal. The file is `<conciv home>/log/conciv-local.log` (by default the conciv home is `~/Library/Application Support/conciv` on macOS, or `CONCIV_HOME`). Every engine process on the machine appends to the same file, each line tagged with its `run`; once an hour the file is trimmed in place to its last 25 MB when it has grown past 50 MB.

- `CONCIV_PRINT_LOGS=1`: also print every log line to stderr.
- `CONCIV_LOG_LEVEL`: the lowest level kept, `DEBUG`, `INFO` (the default), `WARN` or `ERROR`.

To look at a slow turn locally, run a viewer that accepts OTLP over HTTP, for example Jaeger:

```sh
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one
```

Start the process that runs the engine (the host's dev server or the `conciv` CLI) with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` in its own environment; a turbo task drops variables it does not pass through, so run the dev server directly rather than through `turbo run dev`. Then open `http://127.0.0.1:16686`, pick the `conciv` service and sort the traces by duration. Spans are sent in batches every few seconds and when the engine stops.
