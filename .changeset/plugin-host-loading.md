---
'@conciv/plugin-host': patch
'@conciv/protocol': patch
'@conciv/core': patch
---

The engine-side plugin host can find plugins: the new `plugins` key in the conciv config (a name, or a `[name, options]` pair) and the `conciv/plugin` and `conciv/plugins` folders, read in opencode's order. It watches those plugins for changes on disk. It also carries opencode's database client and event bus, with the bus's durable event log; the host owns its event tables and their migrations. `resolveConfig` keeps the `plugins` list. Nothing loads a plugin yet.
