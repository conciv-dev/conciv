# test-runner/src/tool

## Overview

def.ts declares the input `{action: list|run|status, pattern?}` and the output (a list result or a TestRunResult). server.ts maps each action onto the injected manager. card.tsx parses the tool result. When the result is missing or invalid, it opens `makeExtRpcClient(apiBase,'test-runner').stream` and builds rows grouped by file from the live events. It renders a summary chip row, collapsible file sections and failure details with 'Open' and 'Fix this' actions. card.stories.tsx and story.fixtures.ts are Storybook stories and canned data.

## Interface

- `testToolDef` (`def.ts`): tool `test_runner` with streamTitle 'Running tests', `mutating:false` and category `test-runner`
- `TestInput`, `TestOutputSchema` (`def.ts`)
- `testTool` (`server.ts`): server handler that takes `{manager}` as ctx
- `testToolClient` (`client.ts`): `defineTool(testToolDef).render(testCard)`
- `TestCard`, `TestResults`, `testCard` (`hasEmbeddedBody: () => true`) (`card.tsx`)
- Stories `Passing`, `Failing`, `FailureExpanded`, `Running`, `EmbeddedFailing` (`card.stories.tsx`)
- `PASSING_RUN`, `FAILING_RUN`, `storyCtx`, `storyPart`, `storyResult`, `storyAddResult`, `STORY_FRAME_CLASS`, `TEST_TOOL_NAME`, `TEST_TOOL_META` (`story.fixtures.ts`)

## Invariants

- `testTool` (`server.ts`): `list` calls `manager.list()` without failedOnly; `run` passes only `patterns:[pattern]` (no name filter or failedOnly); any other action returns `manager.status()`
- `parseRunResult` (`card.tsx`) returns null unless the result text is JSON that passes `TestRunResultSchema`, so a `list` result also falls back to live-stream mode
- `TestResults` (`card.tsx`): `run-start` resets the live rows, `test` upserts by id (so tests that share a title stay separate rows), and `run-end` replaces the rows, records the final summary and aborts the stream
- `runStatus` (`card.tsx`) sets the card status to 'error' only when `summary.failed > 0`
- `durationLabel` (`card.tsx`) hides durations that are not finite or are <= 0
- `streamInto` (`card.tsx`) retries with `retry: Infinity` and swallows all errors

## Side Effects

- `streamInto` (`card.tsx`) opens a network RPC stream to the `test-runner` extension at `ctx.apiBase` and aborts it on cleanup
- The 'Open' action in `TestFailure` (`card.tsx`) calls the host `useOpenEditor()(file, line)`, and 'Fix this' calls `ctx.sendMessage(fixMessage)`, which sends a chat message
- The `RunSummary` live region (`card.tsx`) updates the DOM with role=status and aria-live=polite

## Verification

- Run: `cd packages/extensions/test-runner && pnpm test`
