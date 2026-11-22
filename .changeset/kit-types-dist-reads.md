---
'@conciv/harness-testkit': patch
'@conciv/publish': patch
---

`start.timeouts` takes any one timeout (`Partial<Pick<StartOpts, ...>>`). `check-turbo-depends-on` now counts a dist read through another package's built types, so a kit consumer's typecheck waits for every dist the kit's types import.
