---
'@conciv/ai': patch
---

Code Mode runs every program in QuickJS on a worker thread, so a busy program such as `while (true) {}` can no longer freeze the server. `@tanstack/ai-isolate-node` and its native `isolated-vm` are no longer dependencies. Stopping a turn also stops the program it is running.
