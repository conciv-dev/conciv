---
'@conciv/solid-diffs': patch
---

Upgrade `@pierre/diffs` to 1.5.2. 1.5 no longer falls back to the file name as the worker
diff-cache key, so two diffs of the same file name no longer share a cache entry and crash
with "deletionLine and additionLine are null". The upstream `applyHighlightResult` guard now
drops highlight results for a superseded file, so our local 1.3.6 patch is gone.
`FileOptions` / `FileDiffOptions` take a second `Caret` type argument.

1.5.2 pins `@pierre/theme@2.0.0`, which is published without npm provenance. Consumers that
install with pnpm `trustPolicy: no-downgrade` must add `@pierre/theme` to `trustPolicyExclude`
until it ships with provenance again.
