# Sources for conciv-develop

Derived by re-reading `SKILL.md` and matching each inline `` `file:line` `` citation to the section
it appears in. A file listed under "General" is in the flat `## Sources` list at the bottom of
`SKILL.md` but is not cited by line number in any one paragraph — it backs the skill as a whole
(a type definition, a package manifest, a whole reference doc) rather than one claim.

## `defineExtension` fields

- `packages/extension/src/define-extension.ts`
- `packages/extension/src/types.ts`

## The tool contract

- `packages/extension/src/define-tool.ts`
- `packages/extensions/tanstack/src/tool/server.ts`
- `packages/extensions/whiteboard/src/tool/comment/def.ts`
- `packages/protocol/src/tool-view-types.ts`

## Widget UI: `Component`, `Surface`, `views`

- `packages/extension/src/hooks.tsx`

## General (supports the whole skill, not one section)

- `apps/examples/tanstack-start/conciv/extensions/blue.tsx`
- `apps/examples/tanstack-start/conciv/extensions/deploy-button.tsx`
- `apps/site/content/docs/extending/index.mdx`
- `apps/site/content/docs/extending/install-first-party.mdx`
- `apps/site/content/docs/extending/your-first-extension.mdx`
- `packages/extension-testkit/src/fixture-host.ts`
- `packages/extension-testkit/src/get-extension-test-api.ts`
- `packages/extension/package.json`
- `packages/extension/src/collect-client.ts`
- `packages/extension/src/define-attachment.ts`
- `packages/extension/src/ext-rpc.ts`
- `packages/extension/src/extension-api.ts`
- `packages/extension/src/host-context.ts`
- `packages/extension/src/index.ts`
- `packages/extension/src/mount-extension.tsx`
- `packages/extension/src/server-stream.ts`
- `packages/extensions/recorder/src/server.ts`
- `packages/extensions/recorder/src/shared/attachment.ts`
- `packages/extensions/tanstack/src/tool/client.ts`
- `packages/extensions/tanstack/test/helpers/tanstack-test-api.ts`
- `packages/extensions/terminal/src/client.tsx`
- `packages/extensions/terminal/src/client/terminal-context.ts`
- `packages/extensions/whiteboard/src/client.tsx`
- `packages/extensions/whiteboard/test/canvas-it-helpers.ts`
- `packages/harness/plugins/claude/skills/conciv-extensions/SKILL.md`
