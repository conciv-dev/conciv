---
'@conciv/ai': patch
---

Code Mode keeps `@tanstack/ai-isolate-node` (native `isolated-vm`) as an optional dependency and uses it first when it loads. When it is missing, for example because pnpm did not approve the `isolated-vm` build, the QuickJS fallback now runs in a worker thread, so a busy program such as `while (true) {}` can no longer freeze the server. Stopping a turn also stops the program it is running.
