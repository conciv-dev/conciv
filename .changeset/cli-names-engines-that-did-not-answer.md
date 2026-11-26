---
'@conciv/cli': patch
---

The `conciv` CLI and `conciv mcp serve` no longer say no dev server is running (or "0 running") when a dev server is only slow to answer its health check. When the quick 300 ms check finds no engine that can answer, they ask the silent ones once more with a 2 s bound, and if those still do not answer, they name each one and the error it gave. Without `--tab`, the CLI no longer falls back to port 5173 while dev servers are registered but silent. `checkEngines` in `@conciv/db` takes an optional `roots` list to check only those engines.
