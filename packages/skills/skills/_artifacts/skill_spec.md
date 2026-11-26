# @conciv/skills: Skill Spec

conciv is a dev-only chat widget plus an engine that lets a coding agent read and act on a running
app. `@conciv/skills` packages the agent-facing knowledge for building with it: installing the
widget, authoring plugins, wiring a new harness adapter, and debugging the sandbox/permission/streaming
runtime once it's live.

## Domains

| Domain                  | Description                                                                                  | Skills         |
| ----------------------- | -------------------------------------------------------------------------------------------- | -------------- |
| Installation & mounting | Getting the widget script into a build and a running app for the first time                  | conciv-setup   |
| Plugin authoring        | Adding project-specific tools, skills, RPC methods and widget UI from a consuming app        | conciv-develop |
| Harness adapters        | Wiring a new coding-agent CLI into conciv as the process behind the chat                     | conciv-harness |
| Runtime debugging       | Diagnosing the sandbox/permission/streaming runtime once the widget is installed and running | conciv-debug   |

## Skill Inventory

| Skill          | Type | Domain            | What it covers                                                                                   | Failure modes |
| -------------- | ---- | ----------------- | ------------------------------------------------------------------------------------------------ | ------------- |
| conciv-setup   | core | installation      | build plugin vs ConcivWidget vs manual mount, harness selection, ConcivConfig/ConcivSettingsInit | 2             |
| conciv-develop | core | plugin-authoring  | Plugin.define, tool contract, Rpc.define, browser part, backend-test-utils                       | 2             |
| conciv-harness | core | harness-adapters  | HarnessAdapter/HarnessCapabilities, chatConfig(), sandbox-virtual cwd                            | 2             |
| conciv-debug   | core | runtime-debugging | widget mount/connect, permission card waits vs rule blocks, port fallback, stream lifecycle      | 2             |

## Failure Mode Inventory

### conciv-setup (2 failure modes)

| #   | Mistake                                                                               | Priority | Source                              | Cross-skill? |
| --- | ------------------------------------------------------------------------------------- | -------- | ----------------------------------- | ------------ |
| 1   | assuming Rollup/esbuild plugin entries boot the engine                                | HIGH     | `packages/it/README.md`             | none         |
| 2   | a webpack/Rspack config with no `mode`, which counts as production and gets no widget | HIGH     | `packages/unplugin/src/unplugin.ts` | none         |

### conciv-develop (2 failure modes)

| #   | Mistake                                                                       | Priority | Source                                      | Cross-skill? |
| --- | ----------------------------------------------------------------------------- | -------- | ------------------------------------------- | ------------ |
| 1   | writing the engine part as `.tsx` or with TypeScript syntax Node cannot strip | HIGH     | `apps/site/content/docs/plugins/index.mdx`  |              |
| 2   | naming a tool with a hyphen                                                   | MEDIUM   | `packages/backend-app-api/src/core/tool.ts` | conciv-debug |

### conciv-harness (2 failure modes)

| #   | Mistake                                                                                     | Priority | Source                                  | Cross-skill? |
| --- | ------------------------------------------------------------------------------------------- | -------- | --------------------------------------- | ------------ |
| 1   | spawning or decoding the CLI directly instead of returning a text adapter from chatConfig() | CRITICAL | `packages/backend-defaults/src/turn.ts` | none         |
| 2   | passing a host-absolute cwd into an adapter config                                          | HIGH     | `packages/harness/src/local-sandbox.ts` | none         |

### conciv-debug (2 failure modes)

| #   | Mistake                                                          | Priority | Source                                                             | Cross-skill? |
| --- | ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------ | ------------ |
| 1   | treating every permission refusal as a user denial               | MEDIUM   | `packages/backend-defaults/src/engine/runtime/permission-cards.ts` | none         |
| 2   | using Playwright networkidle against a page with the live widget | HIGH     | `packages/backend-defaults/src/engine/runtime/primitives.ts`       | none         |

## Tensions

| Tension                        | Skills                        | Agent implication                                                                                                                                                              |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| rule block vs wait-for-a-human | conciv-harness ↔ conciv-debug | A refused call is either an instant rule block (a session `deny` rule, no card) or an ask waiting on the user's card with no timeout: check the widget for an open card first. |

## Cross-References

| From           | To             | Reason                                                                                                                  |
| -------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| conciv-debug   | conciv-setup   | Most "widget never appears" symptoms trace back to the install path conciv-setup owns                                   |
| conciv-debug   | conciv-harness | A stuck first-response with no tool call involved is a harness/CLI problem, not a permission problem                    |
| conciv-develop | conciv-debug   | A plugin tool that asks through `ctx.permission.assert` goes through the same approval mechanism conciv-debug documents |

## Subsystems & Reference Candidates

| Skill          | Subsystems                                      | Reference candidates                                                   |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| conciv-setup   | Vite, Next.js, webpack, Rspack, Rollup, esbuild | none                                                                   |
| conciv-develop | none                                            | tool contract (fields/names/results/errors/approvals), RPC and testing |
| conciv-harness | claude, codex adapters                          | transcript history                                                     |
| conciv-debug   | none                                            | none                                                                   |

## Remaining Gaps

None open.

## Recommended Skill File Structure

- **Core skills:** conciv-setup, conciv-develop, conciv-harness, conciv-debug: all framework-agnostic,
  flat `skills/<slug>/SKILL.md` layout (fewer than 5 skills, minimal-library fast path).
- **Framework skills:** none: @conciv/react/preact/solid are thin wrappers covered inline in
  conciv-setup rather than split into per-framework skills.
- **Lifecycle skills:** none.
- **Composition skills:** none: cross-skill guidance is handled via cross-references, not a
  separate composition skill.
- **Reference files:** conciv-develop and conciv-harness each carry a `references/` directory for
  dense API surfaces (tool contract and RPC/testing details, transcript-history internals); conciv-setup and
  conciv-debug are self-contained.

## Composition Opportunities

| Library      | Integration points                          | Composition skill needed?            |
| ------------ | ------------------------------------------- | ------------------------------------ |
| @tanstack/ai | `chat()`, text adapters, sandbox middleware | no: covered inline in conciv-harness |
