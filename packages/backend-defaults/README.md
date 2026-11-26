# @conciv/backend-defaults

The engine with no plugin in it: the engine and its HTTP, rpc, MCP and login surface (`src/engine`), the chat plane
(turns, hydrate, transcript import, stop, compaction, boot recovery, the permission gate and the chat stores over the
engine database tables in `src/db`), the chat server it runs on (`src/ai`) and code mode. `@conciv/backend` adds the
plugins conciv ships.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Invariants

- The package ships no plugin: `createBackend` (`src/engine/start.ts`) runs only the plugins its caller passes.
- `package.json:type` - ESM only; the `attw` script checks the `esm-only` profile.

## Side Effects

- At runtime turns write the run and thread tables (`src/db`) and publish chat events to the session stream the engine
  serves over oRPC. Full list in [src/README.md](./src/README.md#side-effects).

## Observability

The engine's Effect spans (`Effect.fn` and `Effect.withSpan`) and Effect logs are exported over OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (`src/util/observability.ts`, `src/util/observability/otlp.ts`). With it unset nothing is exported.

- `OTEL_EXPORTER_OTLP_ENDPOINT`: the collector's base URL; traces go to `<endpoint>/v1/traces`, logs to `<endpoint>/v1/logs`.
- `OTEL_EXPORTER_OTLP_HEADERS`: `key=value` pairs, comma separated, sent with every export (for example an auth header).
- `OTEL_RESOURCE_ATTRIBUTES`: `key=value` pairs, comma separated and URI encoded, added to the resource. The `conciv.*` and `service.instance.id` attributes cannot be overridden.

Every engine Effect log line is written to a log file, whether or not an endpoint is set (`src/util/observability/logging.ts`); nothing is printed to the terminal. The file is `<conciv home>/log/conciv-local.log` (by default the conciv home is `~/Library/Application Support/conciv` on macOS, or `CONCIV_HOME`). Every engine process on the machine appends to the same file, each line tagged with its `run`; once an hour the file is trimmed in place to its last 25 MB when it has grown past 50 MB.

- `CONCIV_PRINT_LOGS=1`: also print every log line to stderr.
- `CONCIV_LOG_LEVEL`: the lowest level kept, `DEBUG`, `INFO` (the default), `WARN` or `ERROR`.

To look at a slow turn locally, run a viewer that accepts OTLP over HTTP, for example Jaeger:

```sh
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one
```

Start the process that runs the engine (the host's dev server or the `conciv` CLI) with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` in its own environment; a turbo task drops variables it does not pass through, so run the dev server directly rather than through `turbo run dev`. Then open `http://127.0.0.1:16686`, pick the `conciv` service and sort the traces by duration. Spans are sent in batches every few seconds and when the engine stops.
