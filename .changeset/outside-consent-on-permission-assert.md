---
'@conciv/core': patch
---

An outside agent's consent is a permission card that waits with no timeout: Allow once runs that call, Allow always saves a project rule so later calls in every tab run with no card, Deny refuses that call only, and a caller that leaves drops its card. The 50 s hold, the sticky "outside agents refused" banner and the per-session `hubAccess: 'session'` option are gone; `hubAccess` is `'open'` or `'project'`.
