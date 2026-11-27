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

Engine logs are off by default. The level is set once at start and can change while the engine runs
(`src/util/observability/log-level.ts`); a line below it is dropped before it is formatted. At any level other than
`off`, every engine Effect log line, and every widget event the widget sends through `logs.write` (`source: 'client'`,
redacted in the widget), is stored in the engine database's `log_events` table (`src/util/observability/log-store.ts`,
shaped as `@evlog/nuxthub`'s `evlog_events`, batched by evlog's drain pipeline into one insert, retried on
`SQLITE_BUSY`); it also goes to the host's `log.emit` sink when the host gave one (the dev server and `conciv-try`
print warnings and errors from it), or to stderr when it gave none, and to OTLP when an endpoint is set. An insert that
still fails is dropped and counted (`logs.level` answers `dropped`), never logged. Stored events older than
`logRetention` (config, `7d` by default, `<n>d`, `<n>h` or `<n>m`) are deleted once at start and then every half of the
window. Agents read them with `logs.query` and `logs.tail`, run the cleanup with `logs.cleanup`, and the CLI has
`conciv logs` (`--level`, `--since`, `--grep`, `--follow`) and `conciv logs cleanup`. The login code a browser asks for
is not a log: it always reaches the host sink.

- `CONCIV_LOG_LEVEL`: `off` (the default), `error`, `warn`, `info`, `debug` or `trace`, in any case.

To look at a slow turn locally, run a viewer that accepts OTLP over HTTP, for example Jaeger:

```sh
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one
```

Start the process that runs the engine (the host's dev server or the `conciv` CLI) with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318` in its own environment; a turbo task drops variables it does not pass through, so run the dev server directly rather than through `turbo run dev`. Then open `http://127.0.0.1:16686`, pick the `conciv` service and sort the traces by duration. Spans are sent in batches every few seconds and when the engine stops.
