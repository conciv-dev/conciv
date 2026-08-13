# Sources for conciv-debug

Derived by re-reading `SKILL.md` and matching each inline `` `file:line` `` citation to the section
it appears in. A file listed under "General" is in the flat `## Sources` list at the bottom of
`SKILL.md` but is not cited by line number in any one paragraph — it backs the skill as a whole
(a type definition, a package manifest, a whole reference doc) rather than one claim.

## Failure scenario 1: the conciv button never appears

- `packages/core/src/config.ts`
- `packages/embed/src/mount.ts`
- `packages/plugin/src/core/vite.ts`
- `packages/plugin/src/index.ts`

## Failure scenario 2: widget renders but never connects to the engine

- `packages/core/src/start.ts`
- `packages/embed/src/mount.ts`

## Failure scenario 3: a tool call hangs, then fails

- `packages/core/src/chat/ask.ts`
- `packages/core/src/chat/code-mode.ts`
- `packages/core/src/chat/gate.ts`
- `packages/core/src/chat/run.ts`

## Failure scenario 4: an approval never resolves at all (not even a timeout)

- `packages/core/src/chat/ask.ts`
- `packages/core/src/chat/gate.ts`

## Failure scenario 5: SSE stream never settles, tests hang

- `packages/core/src/chat/subscribe.ts`

## Red flags — stop and check the mechanism, not the symptom

- `packages/core/src/chat/gate.ts`

## General (supports the whole skill, not one section)

- `AGENTS.md`
- `apps/site/content/docs/troubleshooting.mdx`
- `apps/site/content/docs/usage/approvals.mdx`
- `packages/core/src/app.ts`
- `packages/core/src/chat/sandbox.ts`
- `packages/core/src/lib/cors.ts`
