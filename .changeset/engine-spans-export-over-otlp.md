---
'@conciv/backend-app-api': patch
'@conciv/backend': patch
---

The engine exports its Effect spans and logs over OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (with `OTEL_EXPORTER_OTLP_HEADERS` and `OTEL_RESOURCE_ATTRIBUTES`), as opencode does. With the variable unset nothing is exported. Every engine Effect log line now goes to `<conciv home>/log/conciv-local.log` (trimmed to 25 MB past 50 MB) instead of the terminal; `CONCIV_PRINT_LOGS=1` prints them to stderr as well and `CONCIV_LOG_LEVEL` sets the lowest level kept.
