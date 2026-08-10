# @conciv/skills — Skill Spec

conciv is a dev-only chat widget plus an engine that lets a coding agent read and act on a running
app. `@conciv/skills` packages the agent-facing knowledge for building with it: installing the
widget, authoring extensions, wiring a new harness adapter, and debugging the sandbox/gate/SSE
runtime once it's live.

## Domains

| Domain                  | Description                                                                           | Skills         |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------- |
| Installation & mounting | Getting the widget script into a build and a running app for the first time           | conciv-setup   |
| Extension authoring     | Adding project-specific tools, attachments, and UI to the widget from a consuming app | conciv-develop |
| Harness adapters        | Wiring a new coding-agent CLI into conciv as the process behind the chat              | conciv-harness |
| Runtime debugging       | Diagnosing the sandbox/gate/SSE runtime once the widget is installed and running      | conciv-debug   |

## Skill Inventory

| Skill          | Type | Domain              | What it covers                                                                          | Failure modes |
| -------------- | ---- | ------------------- | --------------------------------------------------------------------------------------- | ------------- |
| conciv-setup   | core | installation        | plugin vs manual mount, harness selection, ConcivConfig/ConcivSettingsInit              | 2             |
| conciv-develop | core | extension-authoring | defineExtension/defineTool/defineAttachment, tool contract, testkit                     | 2             |
| conciv-harness | core | harness-adapters    | HarnessAdapter/HarnessCapabilities, chatConfig(), connect.plan(), sandbox-virtual cwd   | 2             |
| conciv-debug   | core | runtime-debugging   | widget mount/connect, gate timeout vs no-listener refusal, port fallback, SSE lifecycle | 2             |

## Failure Mode Inventory

### conciv-setup (2 failure modes)

| #   | Mistake                                                | Priority | Source                        | Cross-skill? |
| --- | ------------------------------------------------------ | -------- | ----------------------------- | ------------ |
| 1   | assuming Rollup/esbuild plugin entries boot the engine | HIGH     | `packages/it/README.md`       | —            |
| 2   | shipping the widget to production with no enabled gate | CRITICAL | `packages/core/src/config.ts` | —            |

### conciv-develop (2 failure modes)

| #   | Mistake                                                                            | Priority | Source                                       | Cross-skill? |
| --- | ---------------------------------------------------------------------------------- | -------- | -------------------------------------------- | ------------ |
| 1   | writing to app state inside a render body or subscription                          | HIGH     | `packages/extension/src/hooks.tsx`           | —            |
| 2   | reading `apps/site/content/docs/extending/*.mdx` as the current extension contract | MEDIUM   | `packages/extension/src/define-extension.ts` | conciv-debug |

### conciv-harness (2 failure modes)

| #   | Mistake                                                                                     | Priority | Source                              | Cross-skill? |
| --- | ------------------------------------------------------------------------------------------- | -------- | ----------------------------------- | ------------ |
| 1   | spawning or decoding the CLI directly instead of returning a text adapter from chatConfig() | CRITICAL | `packages/core/src/chat/run.ts`     | —            |
| 2   | passing a host-absolute cwd into an adapter config                                          | HIGH     | `packages/core/src/chat/sandbox.ts` | —            |

### conciv-debug (2 failure modes)

| #   | Mistake                                                          | Priority | Source                                | Cross-skill? |
| --- | ---------------------------------------------------------------- | -------- | ------------------------------------- | ------------ |
| 1   | treating every approval failure as a user denial                 | MEDIUM   | `packages/core/src/chat/gate.ts`      | —            |
| 2   | using Playwright networkidle against a page with the live widget | HIGH     | `packages/core/src/chat/subscribe.ts` | —            |

## Tensions

| Tension                       | Skills                        | Agent implication                                                                                                                                                            |
| ----------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fail-fast vs wait-for-a-human | conciv-harness ↔ conciv-debug | A stuck tool call is either an instant `noListenerRefusal` (code-mode) or a two-minute `ASK_TIMEOUT_MS` wait (normal chat tools) — the fix depends on which gate path fired. |

## Cross-References

| From           | To             | Reason                                                                                                       |
| -------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| conciv-debug   | conciv-setup   | Most "widget never appears" symptoms trace back to the install path conciv-setup owns                        |
| conciv-debug   | conciv-harness | A stuck first-response with no tool call involved is a harness/CLI problem, not a gate problem               |
| conciv-develop | conciv-debug   | An extension tool with `approval: 'ask'` goes through the same gate/timeout mechanism conciv-debug documents |

## Subsystems & Reference Candidates

| Skill          | Subsystems                                      | Reference candidates                                      |
| -------------- | ----------------------------------------------- | --------------------------------------------------------- |
| conciv-setup   | Vite, Next.js, webpack, Rspack, Rollup, esbuild | —                                                         |
| conciv-develop | —                                               | tool contract (server/client/render/errors/approval/meta) |
| conciv-harness | claude, codex adapters                          | HarnessCapabilities flag matrix                           |
| conciv-debug   | —                                               | —                                                         |

## Remaining Gaps

None open — all four skills were authored and reviewed against current source in this pass.

## Recommended Skill File Structure

- **Core skills:** conciv-setup, conciv-develop, conciv-harness, conciv-debug — all framework-agnostic,
  flat `skills/<slug>/SKILL.md` layout (fewer than 5 skills, minimal-library fast path).
- **Framework skills:** none — @conciv/react/preact/solid are thin wrappers covered inline in
  conciv-setup rather than split into per-framework skills.
- **Lifecycle skills:** none.
- **Composition skills:** none — cross-skill guidance is handled via cross-references, not a
  separate composition skill.
- **Reference files:** conciv-develop and conciv-harness each carry a `references/` directory for
  dense API surfaces (tool contract details, transcript-history internals); conciv-setup and
  conciv-debug are self-contained.

## Composition Opportunities

| Library      | Integration points                               | Composition skill needed?             |
| ------------ | ------------------------------------------------ | ------------------------------------- |
| @tanstack/ai | `chat()`, text adapters, sandbox/gate middleware | no — covered inline in conciv-harness |
