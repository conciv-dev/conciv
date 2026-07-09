---
'@conciv/errors': patch
'@conciv/db': patch
'@conciv/core': patch
---

New @conciv/errors package (typed ConcivError contract with client-safe userMessage/userCode) and @conciv/db package: TrailBase-backed domain-state plane (sessions, drafts, markers) with server lifecycle, records client, TanStack DB collection factories, and Solid hooks. Core now spawns TrailBase, stores sessions in it, publishes turn status, owns compaction server-side, and returns structured redacted errors.
