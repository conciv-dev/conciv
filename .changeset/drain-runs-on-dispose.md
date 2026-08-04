---
'@conciv/core': patch
---

Track in-flight chat runs and drain them when the app is disposed, so a shutdown no longer races a
turn's teardown (leftover harness temp files, writes against a closed database). `makeApp` now
returns a single `dispose()` that drains runs, runs extension disposers, and closes the sqlite
handle, replacing the separate `disposers`/`closeDb` pair callers could forget. The MCP route also
closes its per-request server and transport instead of leaking one per POST.
