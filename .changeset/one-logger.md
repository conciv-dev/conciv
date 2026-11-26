---
'@conciv/backend-defaults': patch
'@conciv/types': patch
'@conciv/cli': patch
'@conciv/protocol': patch
---

Engine logs are off by default and go through one logger. The engine's two Effect logger stacks (file, stderr and OTLP; the host's `log.emit` sink) are one layer whose level lives in a service the engine creates, so it can change while the engine runs. `CONCIV_LOG_LEVEL` takes `off` (the default), `error`, `warn`, `info`, `debug` or `trace`; `CONCIV_PRINT_LOGS` is gone: at any level other than `off` the lines go to the host's sink, or to stderr when the host gave none. The login code a browser asks for is not a log and always reaches the host. Every hand-made log callback in the engine is gone: promise code logs with `Effect.log*` on the engine runtime.

Logs are turned on by `conciv({logLevel})`, `CONCIV_LOG_LEVEL` (which wins over the config) and, for the CLI's own diagnostics on stderr, `--verbose` (debug) or `--log-level <level>`, which win over both. One function, `readLogLevel` in `@conciv/types/config-types`, computes the level everywhere.

An agent can switch logs while the engine runs: `logs.level` (a live stream of `{engine, widget}`) and `logs.setLevel` on the rpc contract, `conciv logs level [<level>] [--scope engine|widget|all]` in the CLI, and the `set_log_level` tool inside, which asks the user before raising the widget above `warn`.
