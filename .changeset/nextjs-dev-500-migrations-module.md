---
'@conciv/db': patch
---

Ship sqlite migrations as a build-time generated module instead of a runtime-resolved `drizzle/` directory, so the engine graph survives being bundled into the Next.js instrumentation compile in pnpm workspace dev (fixes the clean-`.next` 500 in workspace Next apps). Drizzle's own `readMigrationFiles` parses the `drizzle/` folder during the package build and its `MigrationMeta` output is emitted as a gitignored generated module that `migrateSync` executes at runtime — no SQL duplicated in the repo and no hand-rolled migration parser.
