# Plan 019: `conciv_open` refuses to open files outside the project root

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/plugin/src/core/open-editor.ts`
> If that file changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

The `conciv_open` tool lets the agent open a source file in the user's editor (e.g. after a locate/inspect). The path comes from the agent (`file: z.string()`), so a prompt-injected or misaligned turn controls it. The relative-path branch correctly confines the target to the project root via a `within()` containment check, but the **absolute-path branch has no such check**: any absolute path that exists on disk is opened. That lets the agent pop open files outside the workspace — `~/.ssh/*`, dotfiles, credential files — a containment escape of the "edit the project you're running" boundary (file disclosure, not code-exec). This plan applies the same root-containment check to the absolute branch, so an out-of-root absolute path is silently refused like a relative `../` escape already is.

## Current state

- `packages/plugin/src/core/open-editor.ts` — the entire file (13 lines):

```ts
import {isAbsolute, resolve, sep} from 'node:path'
import {existsSync} from 'node:fs'
import launchEditor from 'launch-editor'

const within = (root: string, p: string): boolean => p === root || p.startsWith(root + sep)

export function makeOpenInEditor(root: string) {
  return (file: string, line: number): void => {
    if (isAbsolute(file) && existsSync(file)) return void launchEditor(`${file}:${line}`)
    const abs = resolve(root, file.replace(/^\/+/, ''))
    if (within(root, abs)) launchEditor(`${abs}:${line}`)
  }
}
```

The bug is line 9: `if (isAbsolute(file) && existsSync(file)) return void launchEditor(...)` opens _any_ existing absolute path with no `within(root, …)` guard. The relative branch (lines 10–11) is already safe.

- Callers (context only, do NOT edit):
  - `packages/tools/src/open.ts` — defines `concivOpenToolDef` (`conciv_open`), input `{file: z.string().min(1), line: z.number().optional()}`.
  - `packages/core/src/app.ts:200` — wires the tool's server handler to `openInEditor`.
  - `makeOpenInEditor` is constructed with the sandbox/project `root`.

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`/non-null. oxfmt: no semicolons, single quotes, no bracket spacing, printWidth 120.
- The existing `within(root, p)` helper is the containment primitive — reuse it, do not hand-roll a new check.

## Commands you will need

| Purpose            | Command                                                     | Expected on success    |
| ------------------ | ----------------------------------------------------------- | ---------------------- |
| Typecheck (plugin) | `pnpm exec turbo run typecheck --filter=@conciv/plugin`     | exit 0                 |
| Test (plugin)      | `pnpm exec turbo run test --filter=@conciv/plugin`          | all pass               |
| Lint (plugin)      | `pnpm exec turbo run lint --filter=@conciv/plugin`          | exit 0                 |
| Fallow             | `pnpm exec fallow audit --changed-since main --format json` | no INTRODUCED findings |

## Scope

**In scope**:

- `packages/plugin/src/core/open-editor.ts`
- A new test file `packages/plugin/test/open-editor.test.ts` (create — see "STOP conditions" if `packages/plugin/test/` doesn't exist; check first with `ls packages/plugin/test 2>/dev/null || ls packages/plugin`).

**Out of scope**:

- `packages/tools/src/open.ts`, `packages/core/src/app.ts` — the tool definition and wiring are correct; only the editor-launch helper is wrong.
- The relative-path branch behavior — it already confines correctly; do not change how relative paths resolve.
- `launch-editor` invocation format (`${path}:${line}`) — keep it.

## Git workflow

- Branch: `advisor/019-conciv-open-path-containment`
- Commit style: `fix(plugin): confine conciv_open to the project root for absolute paths`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Apply the containment check to the absolute branch

Rewrite the returned function in `open-editor.ts` so an absolute path is resolved and containment-checked before launching. Target shape:

```ts
export function makeOpenInEditor(root: string) {
  return (file: string, line: number): void => {
    const abs = isAbsolute(file) ? resolve(file) : resolve(root, file.replace(/^\/+/, ''))
    if (within(root, abs)) launchEditor(`${abs}:${line}`)
  }
}
```

Notes:

- `resolve(file)` normalizes the absolute path (collapses `..`), so `within` sees the real target.
- The `existsSync` check is dropped: `launch-editor` handles a missing file gracefully, and keeping an existence check would only reintroduce a branch. If you prefer to keep existence-gating, apply it _after_ the `within` check, never before it. Either is acceptable; the containment check is the load-bearing part.
- A relative path with a `../` escape still resolves outside `root` and is now refused by the same `within` guard (it already was).

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/plugin` → exit 0.

### Step 2: Add a containment test

Create `packages/plugin/test/open-editor.test.ts`. Because `launchEditor` actually spawns an editor, inject a spy instead of calling the real one — but `makeOpenInEditor` imports `launch-editor` directly, so the cleanest test asserts _whether launch would happen_ by checking the `within` decision. Since `launchEditor` is a module default import, use vitest's `vi.mock('launch-editor', () => ({default: vi.fn()}))` at the top of the test, import the mocked default, and assert call/no-call. Target cases:

- `makeOpenInEditor('/project')('/project/src/a.ts', 3)` → editor launched with `/project/src/a.ts:3`.
- `makeOpenInEditor('/project')('src/a.ts', 3)` → editor launched with `/project/src/a.ts:3` (relative, in-root).
- `makeOpenInEditor('/project')('/etc/passwd', 1)` → editor **not** launched.
- `makeOpenInEditor('/project')('../secrets.txt', 1)` → editor **not** launched.
- `makeOpenInEditor('/project')('/project/../other/x', 1)` → editor **not** launched (resolves outside root).

Model the vitest mock/spy layout after any existing `packages/plugin/test/*.test.ts` if present (check with `ls packages/plugin/test`); if the package has no test dir yet, create one and ensure `packages/plugin` has a `test` script (it should — verify `grep '"test"' packages/plugin/package.json`).

**Verify**: `pnpm exec turbo run test --filter=@conciv/plugin` → all pass, including the 5 new cases.

### Step 3: Lint + fallow

**Verify**:

- `pnpm exec turbo run lint --filter=@conciv/plugin` → exit 0
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- File: `packages/plugin/test/open-editor.test.ts` (new).
- Cases: the 5 listed in Step 2 — in-root absolute (launch), in-root relative (launch), out-of-root absolute (refuse), relative `..` escape (refuse), absolute-with-`..`-escape (refuse).
- Mock `launch-editor` so no real editor spawns; assert the mock was/wasn't called and with what argument.
- Verification: `pnpm exec turbo run test --filter=@conciv/plugin` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm exec turbo run typecheck lint test --filter=@conciv/plugin` exits 0
- [ ] `open-editor.ts` calls `within(root, abs)` on the absolute-path case (no `launchEditor` reachable without passing `within`)
- [ ] The out-of-root absolute case and the `..`-escape case both result in no `launchEditor` call (asserted by tests)
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `open-editor.ts` doesn't match the "Current state" excerpt (drift).
- `packages/plugin` has no `test` script and no vitest config, and adding a test dir would require build/config changes beyond a single test file — report so the harness can be set up separately (the fix in Step 1 can still land; the test is the blocker).
- Mocking `launch-editor` doesn't work with the package's module setup after one reasonable attempt — report; do not delete the existence/containment logic to make a test pass.

## Maintenance notes

- Any future tool that turns an agent-supplied string into a filesystem path (open, read, screenshot-of-file, download-to) must apply the same `within(root, …)` containment. This helper is the reference pattern.
- A reviewer should check that no code path reaches `launchEditor` (or any editor/file open) without first passing `within`.
- Deferred: symlink escapes (a symlink _inside_ root pointing outside). `resolve` does not follow symlinks; if that threat matters later, add a `realpath` + re-check, mirroring `packages/core/src/editor/symbolicate.ts` which already does realpath-containment. Out of scope here.
