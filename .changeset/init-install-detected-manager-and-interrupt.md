---
'@conciv/cli': patch
---

`conciv init` installs with the detected package manager, falling back to npm in a project with no lockfile instead of failing, and runs pnpm and yarn through corepack when corepack is available, as before. Ctrl-C between steps now restores the config and exits with code 130; before, it ended the process without restoring the config. An interrupted install is asked to stop with SIGINT, so npm rolls back, given up to five seconds (a second Ctrl-C skips the wait), then ended, and the config is restored only after it has stopped.
