# test-runner/src/shared

## Overview

events.ts defines the TestEvent discriminated union (`snapshot`, `run-start`, `test`, `file-end`, `run-end`) and the summary, row and error shapes used across the server, the children and the client. It also holds helpers that count states and turn a vitest-like test case into a TestError. meta.ts defines the config schema that selects the runner.

## Interface

- `TestEventSchema`/`TestEvent`, `TestRunResultSchema`/`TestRunResult`, `TestRowSchema`/`TestRow`, `TestErrorSchema`/`TestError`, `SummarySchema`/`Summary`, `FileStateSchema`/`FileState`, `TestStateSchema`/`TestState` (`events.ts`)
- `countStates(tests)` (`events.ts`): returns pass, fail and skip counts
- `parseFailure(tc)` (`events.ts`): returns a TestError for a failed vitest-like test case, otherwise null
- `TestCaseLike` type (`events.ts`)
- `TEST_RUNNER_NAME` = 'test-runner', `testRunnerConfig`, `TEST_RUNNER_PROMPT` (`meta.ts`)

## Invariants

- `testRunnerConfig.runner` (`meta.ts`) is an enum of 'vitest', 'jest', 'node-test' and 'playwright', defaulting to 'vitest'
- `TestStateSchema` (`events.ts`) allows only pass, fail and skip; FileState also allows `running`
- `parseFailure` (`events.ts`) returns null unless the state is `failed`. It uses the first error, defaults the message to 'test failed', prefers the stack frame in the test's own module, and sets `stack` equal to `message`.

## Side Effects

- None

## Verification

- Run: `cd packages/extensions/test-runner && pnpm test`
