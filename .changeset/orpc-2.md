---
'@conciv/client': patch
---

The engine, the widget and the CLI now speak oRPC 2 (2.0.0-beta.53). The oRPC 2 wire format differs from oRPC 1, so all three must run the same release: an older widget bundle cached in a host page, or an older globally installed CLI, cannot talk to a newer engine until it is upgraded.
