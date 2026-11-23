---
'@conciv/harness': patch
'@conciv/core': patch
---

A Claude Code that is not on the PATH is no longer probed. The login check answers "Claude Code is not installed. Install it, then run `claude auth login`." without starting anything, the model and slash-command lists fail with the same message, and a send is refused with it before anything is spawned. Each check looks at the PATH again, so a `claude` installed later is found and probed on the next check. The PATH lookup is the one core already uses to detect the other agent CLIs, now shared from `@conciv/harness`.
