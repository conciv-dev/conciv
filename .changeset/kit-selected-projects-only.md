---
'@conciv/plugin-testkit': patch
---

`--project` naming only kit projects makes the kit add only those projects, so vitest no longer resolves the vite config of the projects the run leaves out.
