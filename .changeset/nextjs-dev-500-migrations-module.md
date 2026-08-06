---
'@conciv/db': patch
---

Ship sqlite migrations as an inlined module instead of a runtime-resolved `drizzle/` directory, so the engine graph survives being bundled into the Next.js instrumentation compile in pnpm workspace dev (fixes the clean-`.next` 500 in workspace Next apps).
