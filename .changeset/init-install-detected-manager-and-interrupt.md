---
'@conciv/cli': patch
---

`conciv init` installs with the detected package manager, falling back to npm in a project with no lockfile instead of failing. Ctrl-C at any point of the run ends the install child's process group before the config is restored, and exits with code 130.
