---
'@conciv/extension-compiler': patch
---

Dev hosts running behind an AI agent (`CLAUDECODE`, `AI_AGENT`, etc.) no longer hit an unbounded browser console echo loop. Vite 8 auto-enables `server.forwardConsole` when it detects an agent env, and `@tanstack/devtools-vite`'s console pipe re-injects forwarded server logs into the page as `[Server] ...` entries; a page-side `console.error` (e.g. the widget's virtualizer `ResizeObserver` warning) could round-trip forever, growing on every hop. `concivSolidConfig` now explicitly sets `server.forwardConsole: false`, so every host wired through the conciv vite plugin is immune regardless of environment variables.
