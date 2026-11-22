---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/core': patch
'@conciv/serve': patch
'@conciv/plugin-host': patch
---

With `OTEL_EXPORTER_OTLP_ENDPOINT` set, a trace now shows a whole chat turn (the model steps, each tool call, code mode with each tool call made inside the program, the tool bridge and the permission ask), every RPC call by its procedure path, native session reads, and each step of an engine start and stop. All of it goes to the one exporter the engine already had. Spans carry ids and names only, never message text, tool input or output.
