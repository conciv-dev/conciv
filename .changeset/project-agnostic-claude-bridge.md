---
'@conciv/harness-init': patch
---

Resolve the conciv dev server inside the claude connect bridge at request time instead of baking its
URL into the plugin manifest. Claude caches the plugin once per version under a path with no project
component, so two projects on one machine used to overwrite each other's cached `.mcp.json` and
sessions bridged to the wrong project's server. The generated plugin is now byte-identical for every
project, and each attach writes `.conciv/mcp-endpoint.json` next to the plugin tree; the bridge walks
up from its working directory, reads that file per request, and fails with the directory it searched
when no dev server is recorded. A dev server that restarts on a new port is picked up without a
plugin reinstall, and a marketplace registered by another project no longer triggers reinstall
ping-pong.
