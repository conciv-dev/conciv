# Test kits, step 3a (the CLI runner, and one environment defect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a node test run the built conciv CLI against the test's engine and read what it prints, and stop agent-shell variables from leaking into the test engine.

**Architecture:** `cli` is one function in `@conciv/harness-testkit`, in opencode's shape: it spawns the built `@conciv/cli` bin with the isolated environment and returns what it printed and its exit code. The environment fix is two lines in `isolated-env.ts`.

**Tech Stack:** as step 0.

**Spec:** `docs/specs/kit-plan.md` (step 3). Facts: lane report `020119-plugins-a.md` in the orchestrator inbox and the reader files it names. This plan is step 3a: the announced engine, two engines on one home and servers mode are NOT in it, because each needs a ruling from the maintainer (see the end).

## Global Constraints

All of the step 0 plan's "Global Constraints" and the additions of the step 1 and step 2a plans apply. Steps 0, 1 and 2a have landed. Proofs are throwaway, run through the committed bin file, in `packages/plugins/test-runner` (node project).

## Review Focus

1. A test run from inside an agent shell (`CLAUDECODE`, `CODEX_THREAD_ID`, `GEMINI_CLI`, `OPENCODE` set): the engine and the spawned CLI must not see them (Task 1).
2. A CLI command that fails: `cli` resolves with its exit code and output, it does not throw (Task 2).
3. A CLI that never exits: `cli` gives up with a plain message after the kit's tool deadline, and kills the child (Task 2).
4. The CLI must not reach the developer's real conciv home or a real running engine (Task 2).

---

### Task 1: agent-shell variables do not reach the engine

**Files:** `packages/harness-testkit/src/isolated-env.ts`, `src/README.md`; `.changeset/kit-agent-shell-variables.md`.

**Interfaces:** `isolatedEnv` also drops `CLAUDECODE`, `CODEX_THREAD_ID`, `GEMINI_CLI` and `OPENCODE`. These are the variables the CLI reads to tag a call with the calling agent (`packages/cli/src/request.ts:95-103`); with one set, an outside call is refused as "<agent> is disconnected from conciv". opencode's test environment filters its own agent variables the same way (`packages/core/script/test.ts:10-35`).

Before the change, read `request.ts:95-103` and list the exact variable names it reads; drop exactly those (if the list differs from the four above, use the code's list and report it).

- [ ] **Step 1: Proof** (throwaway unit proof in `packages/harness-testkit/src/isolated-env.test.ts`):

```ts
import {expect, test} from 'vitest'
import {isolatedEnv} from './isolated-env.js'

test('the engine does not learn which agent shell started the tests', () => {
  const source = {PATH: '/usr/bin', CLAUDECODE: '1', CODEX_THREAD_ID: 't', GEMINI_CLI: '1', OPENCODE: '1'}

  expect(Object.keys(isolatedEnv(source, '/kit/home', '/kit/tmp'))).not.toContain('CLAUDECODE')
  expect(isolatedEnv(source, '/kit/home', '/kit/tmp')).toMatchObject({PATH: '/usr/bin'})
  expect(
    Object.keys(isolatedEnv(source, '/kit/home', '/kit/tmp')).filter((name) => /CODEX|GEMINI|OPENCODE/.test(name)),
  ).toEqual([])
})
```

- [ ] **Step 2: Failing run. Step 3: Change. Step 4: Passing run; rerun every earlier proof through the wrapper. Step 5: Gates, commit** `fix(harness-testkit): agent-shell variables do not reach the test engine`.

---

### Task 2: run the CLI

**Files:** create `packages/harness-testkit/src/cli.ts`; modify `packages/harness-testkit/src/harness-engine.ts` (re-export), `package.json` (peer `@conciv/cli`, as the other `@conciv/*` peers), `src/README.md`; `packages/plugin-testkit/src/node.ts` (re-export; the browser entry does NOT get it); `.changeset/kit-cli.md`.

**Interfaces:**

- Produces: `cli(args: string[], options?: {cwd?: string; env?: Record<string, string>}): Promise<{stdout: string; stderr: string; exitCode: number}>`. It spawns `process.execPath` on the built CLI bin, resolved from the package under test as `@conciv/cli/bin` (`packages/cli/package.json:18-27`), with `env: {...isolatedEnv(process.env, <a temp home made for this call>, <its tmp>), ...options.env}` and `cwd: options.cwd ?? <that temp home>`. The temp home is removed when the child exits. A non-zero exit resolves, it does not throw. After the kit's tool deadline (60 s, `call-tool.ts`) the child is killed and the call rejects with a plain message.
- Exported from `@conciv/harness-testkit` and from `@conciv/plugin-testkit/node`. Node only: in browser mode the plugin testkit's entry has no `cli`.
- A test that wants the CLI to reach its engine passes the engine itself: `env: {CONCIV_PORT: new URL(engine.address.apiBase).port, CONCIV_TOKEN: engine.address.token}` (`packages/cli/src/engine-origin.ts:20-49`).

Facts (read): the bin runs only when it is the entry (`packages/cli/src/bin.ts:5-11`); results and failures print one JSON envelope line (`envelope.ts:9,17`); `--help` and `--version` print plain text (`run.ts:32,36`); opencode's tests keep a private `cli()` of this exact shape per file (`packages/cli/test/auth.test.ts:375-386`) with an isolated environment (`cli/test/fixture/environment.ts:8-26`).

Before writing the proofs, read and cite: what `conciv --version` prints (the exact text and where it comes from), and the exact argv and envelope of one read-only command that needs only `CONCIV_PORT` and `CONCIV_TOKEN` (the facts name `plugin call` and `tools`); use the test runner plugin's `status` rpc if `plugin call` takes an rpc id and method.

- [ ] **Step 1: Proofs** `src/kit-cli.test.ts` (node):

```ts
import {expect, test} from 'vitest'
import {cli, createEngine} from '@conciv/plugin-testkit/node'

test('the conciv CLI prints its version', async () => {
  const run = await cli(['--version'])

  expect(run).toMatchObject({exitCode: 0, stderr: ''})
  expect(run.stdout).toMatch(VERSION_TEXT)
})

test("the conciv CLI calls a plugin of the test's engine", async () => {
  const engine = await createEngine({plugins: ['@conciv/plugin-test-runner']})

  const run = await cli(PLUGIN_CALL_ARGS, {
    env: {CONCIV_PORT: new URL(engine.address.apiBase).port, CONCIV_TOKEN: engine.address.token},
  })

  expect(run.exitCode).toBe(0)
  expect(JSON.parse(run.stdout)).toMatchObject(PLUGIN_CALL_ENVELOPE)
})

test('a CLI command that fails answers with its exit code', async () => {
  const run = await cli(['no-such-command'])

  expect(run.exitCode).not.toBe(0)
})
```

`VERSION_TEXT`, `PLUGIN_CALL_ARGS` and `PLUGIN_CALL_ENVELOPE` are the literals read above, written inline.

- [ ] **Step 2: Failing run** (`cli` is not exported). **Step 3: Change. Step 4: Passing run; check no temp home is left (`ls "$TMPDIR" | grep conciv`). Step 5: Gates plus `publint` and `attw` for both kits, `check-turbo-depends-on` (a new peer), commit** `feat(testkits): a node test runs the conciv CLI`.

---

## Not in this plan: needs the maintainer

1. **An engine started the way the dev server starts it.** The product's `start` cannot take several harnesses, the timeouts or the stale-code value, so such an engine would silently drop three step 1 options. Choices: the kit refuses those options together with it; `start` forwards them (a product change); or it is used only for CLI and registry journeys that do not need them.
2. **Two engines on one home.** In the product only the CLI and the hub can see a second engine; the app never reads the registry. So its only proof is through the CLI, on top of point 1.
3. **Servers mode.** How a test hands `mount` the try-it window plugin: composed in the test as the website does, composed by the kit from plain data, or named by package (which cannot work in browser mode). Also to settle with a run: only ten connect ports exist on the machine, shared by every test worker and every lane; and the servers-mode app has no login step, so whether its socket is trusted after binding is unknown and may be a product defect.

## Decisions to confirm (made by the orchestrator while the maintainer was away)

1. `cli` lives in `@conciv/harness-testkit` and is re-exported by `@conciv/plugin-testkit/node` only.
2. Each `cli` call gets a fresh temp home; a test that wants the engine's home passes it in `env`.
3. `@conciv/cli` becomes a peer of the harness testkit.
