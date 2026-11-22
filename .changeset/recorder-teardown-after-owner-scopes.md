---
'@conciv/plugin-recorder': patch
---

The recorder closes every owner scope before it disposes its runtime, and drops a late rrweb event from a stopped capture instead of throwing `ManagedRuntime disposed`.
