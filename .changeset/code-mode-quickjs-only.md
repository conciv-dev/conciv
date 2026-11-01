---
'@conciv/ai': patch
---

Code Mode now always runs on QuickJS (`@tanstack/ai-isolate-quickjs`, WebAssembly). The optional `@tanstack/ai-isolate-node` driver and its native `isolated-vm` build are gone, so installing conciv needs no native build and pnpm no longer stops the install to ask about `isolated-vm`'s build script.
