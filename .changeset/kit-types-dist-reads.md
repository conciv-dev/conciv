---
'@conciv/core': patch
'@conciv/publish': patch
---

The test engine's `start.timeouts` (`@conciv/core/testing`) takes any one timeout (`Partial<Pick<StartOpts, ...>>`). `check-turbo-depends-on` now counts a dist read through another package's built types, so a typecheck waits for every dist the types it reads import.
