---
'@conciv/cli': patch
---

The `conciv` CLI now reads its commands with `@bomb.sh/router` instead of citty. `conciv --version` and `conciv -v` print the CLI version. Help output has a new layout. Argument mistakes still come back as one JSON error with a suggested fix.
