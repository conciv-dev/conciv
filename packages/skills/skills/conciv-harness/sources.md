# Sources for conciv-harness

Derived by re-reading `SKILL.md` and matching each inline `` `file:line` `` citation to the section
it appears in. A file listed under "General" is in the flat `## Sources` list at the bottom of
`SKILL.md` but is not cited by line number in any one paragraph — it backs the skill as a whole
(a type definition, a package manifest, a whole reference doc) rather than one claim.

## The shape

- `packages/harness/src/codex/index.ts`
- `packages/harness/src/registry.ts`

## HarnessCapabilities: flags that gate the type, not just behavior

- `packages/core/src/chat/run.ts`
- `packages/protocol/src/harness-types.ts`

## chatConfig(deps): the one required function

- `packages/harness/src/_shared/env.ts`
- `packages/harness/src/_shared/text-adapter.ts`
- `packages/harness/src/claude/chat.ts`
- `packages/harness/src/codex/index.ts`
- `packages/protocol/src/harness-types.ts`

## `chat()` owns the turn — you never spawn or decode the CLI in core/widget

- `packages/core/src/chat/gate.ts`
- `packages/core/src/chat/run.ts`
- `packages/core/src/chat/sandbox.ts`

## Sandbox-virtual workdir: `chatConfig` never passes a host `cwd`; `connect.plan()` legitimately does

- `packages/harness/src/claude/chat.ts`
- `packages/harness/src/claude/sdk.ts`
- `packages/harness/src/codex/index.ts`
- `packages/harness/src/pi/index.ts`

## connect.plan(): the argv/env/files launch plan

- `packages/harness/src/codex/args.ts`
- `packages/harness/src/codex/index.ts`
- `packages/protocol/src/harness-types.ts`

## Sidecars

- `packages/harness/src/registry.ts`
- `packages/protocol/src/harness-types.ts`

## HarnessHistory: reading the CLI's own transcript

- `packages/harness/src/codex/history.ts`
- `packages/protocol/src/harness-types.ts`

## General (supports the whole skill, not one section)

- `AGENTS.md`
- `apps/site/content/docs/harnesses.mdx`
- `packages/harness/src/_shared/jsonl-handle.ts`
- `packages/harness/src/claude/index.ts`
