---
'@conciv/app': patch
'@conciv/embed': patch
---

A re-login keeps the running plugins: the plugin loader mounts once, on the first trust, and reads one stable source, so an unchanged plugin is not torn down and started again.
