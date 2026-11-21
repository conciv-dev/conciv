---
'@conciv/plugin-host': patch
'@conciv/core': patch
---

The engine exports its Effect spans and logs over OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (with `OTEL_EXPORTER_OTLP_HEADERS` and `OTEL_RESOURCE_ATTRIBUTES`), as opencode does. With the variable unset nothing changes.
