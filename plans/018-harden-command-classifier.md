# Plan 018: Command auto-allow classifier rejects exec/write-capable commands, with a characterization test suite

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/core/src/chat/gate.ts packages/core/test/chat/command-policy.test.ts`
> If either file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

`classifyCommand` decides whether an agent-issued Bash command runs automatically (`'allow'`) or surfaces an Approve/Deny card to the user (`'ask'`). It is the core safety control of the whole product: a dev-only AI agent that can run shell commands. The current allowlist admits several commands that can execute arbitrary programs or write/delete files while still classifying as read-only, so a prompt-injected or misaligned agent turn can run mutating commands with **no approval prompt**. Concretely: `env FOO=bar <program>` runs an arbitrary program; `find . -delete` / `find . -exec <cmd> {} +` deletes/executes; `git branch -D` / `git log --output=<file>` mutate refs / write files; and bare `env` dumps the process environment (which may contain API keys) into the agent transcript. Tightening the classifier only ever produces _more_ approval prompts, never fewer — the worst case is an extra card for a benign `find`/`env`. This plan closes those holes and locks the behavior in with a table-driven test so a future edit that re-widens the allowlist fails CI.

## Current state

- `packages/core/src/chat/gate.ts:25-53` — the classifier. Excerpt as it exists today:

```ts
const READ_ONLY = new Set([
  'ls',
  'cat',
  'pwd',
  'echo',
  'head',
  'tail',
  'grep',
  'rg',
  'find',
  'which',
  'wc',
  'env',
  'date',
  'true',
])

const GIT_READ_ONLY = new Set(['status', 'diff', 'log', 'show', 'branch'])

export function classifyCommand(command: string): CommandPolicy {
  const c = command.trim()
  if (c === '') return 'ask'

  if (/[;&|`$><\n]/.test(c)) return 'ask'
  if (c.startsWith('conciv tools')) return 'allow'
  const tokens = c.split(/\s+/)
  if (tokens[0] === 'git') return GIT_READ_ONLY.has(tokens[1] ?? '') ? 'allow' : 'ask'
  return READ_ONLY.has(tokens[0] ?? '') ? 'allow' : 'ask'
}
```

The specific holes:

1. **`env` in `READ_ONLY`** — `env` is a program runner; `env <anything>` (or `env VAR=x <program>`) executes an arbitrary program. Bare `env` also prints the environment.
2. **`find` in `READ_ONLY`** — `find` supports write/exec action predicates: `-delete`, `-exec`/`-execdir`, `-fprintf`, `-fprint`, `-fls`. The `+` terminator of `-exec … {} +` contains none of the blocked metacharacters, so it passes the screen.
3. **Metacharacter screen `/[;&|`$><\n]/` at line 48** omits `+`, `{`, and `}`, which is why `find … -exec … {} +` slips through. (It does already block `&`, so `&&` is caught.)
4. **`git` classified by subcommand only (`tokens[1]`), never by flags** — `git branch -D <name>` / `--force` mutates refs; `git log --output=<file>` writes a file; `git show` is read-only but harmless. Only the subcommand name is inspected, so dangerous flags on an allowed subcommand pass.

- `packages/core/test/chat/command-policy.test.ts` — the _entire_ existing test (17 lines, ~7 assertions):

```ts
import {describe, it, expect} from 'vitest'
import {classifyCommand} from '../../src/chat/gate.js'

describe('classifyCommand', () => {
  it('allows read-only commands and gates mutating ones', () => {
    expect(classifyCommand('ls -la')).toBe('allow')
    expect(classifyCommand('git status')).toBe('allow')
    expect(classifyCommand('git push')).toBe('ask')
    expect(classifyCommand('rm -rf dist')).toBe('ask')
  })

  it('allows the agent CLI, but still gates it when composed with a pipe or redirect', () => {
    expect(classifyCommand('conciv tools page snapshot')).toBe('allow')
    expect(classifyCommand('conciv tools page changes | tee evil.txt')).toBe('ask')
    expect(classifyCommand('conciv ui confirm --question x')).toBe('ask')
  })
})
```

### Repo conventions to follow

- Functions, not classes. No code comments (a lint rule auto-deletes them — write self-explanatory code). No `any`/`as`/non-null-assertion. oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Tests are vitest; this file already runs under `packages/core`'s node vitest config. Match its `describe`/`it`/`expect` shape.
- `CommandPolicy` is `'allow' | 'ask'` (`gate.ts:23`).

## Commands you will need

| Purpose                      | Command                                                     | Expected on success    |
| ---------------------------- | ----------------------------------------------------------- | ---------------------- |
| Typecheck (core)             | `pnpm exec turbo run typecheck --filter=@conciv/core`       | exit 0                 |
| Test (this file)             | `pnpm exec turbo run test --filter=@conciv/core`            | all pass               |
| Lint (core)                  | `pnpm exec turbo run lint --filter=@conciv/core`            | exit 0                 |
| Fallow (introduced findings) | `pnpm exec fallow audit --changed-since main --format json` | no INTRODUCED findings |

Note: `test` `dependsOn` build, so the turbo test run builds dependencies first — this is expected and correct; do not hand-build.

## Scope

**In scope** (the only files you should modify):

- `packages/core/src/chat/gate.ts` (the `classifyCommand` function + the two Sets only)
- `packages/core/test/chat/command-policy.test.ts` (expand)

**Out of scope** (do NOT touch):

- Any other function in `gate.ts` (the sandbox, the approval-gate `awaitReply`, `makeRunGate`, `abortSafeProcess` — unrelated to classification).
- The permission/approval UI or the `decide` flow. This plan only changes which commands _reach_ the ask path, not how asking works.
- Do NOT try to make the classifier a full shell parser. It is an intentional conservative allowlist: when in doubt, `'ask'`. Widening what `'allow'` covers is never the goal here.

## Git workflow

- Branch: `advisor/018-harden-command-classifier`
- Commit style: conventional commits, e.g. `fix(core): reject exec/write commands from the auto-allow classifier`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the failing characterization test first

Replace the body of `packages/core/test/chat/command-policy.test.ts` with a table-driven suite. Keep the two existing `it` blocks (they must still pass) and add cases covering every hole. Target shape:

```ts
import {describe, it, expect} from 'vitest'
import {classifyCommand} from '../../src/chat/gate.js'

const ALLOW = [
  'ls -la',
  'cat file.ts',
  'pwd',
  'git status',
  'git diff',
  'git log',
  'git show HEAD',
  'rg foo',
  'conciv tools page snapshot',
]

const ASK = [
  'git push',
  'rm -rf dist',
  'env',
  'env FOO=bar node script.js',
  'env node -e "1"',
  'find . -delete',
  'find . -exec rm {} +',
  'find . -exec rm {} \\;',
  'find . -execdir sh {} +',
  'find . -fprintf out.txt %p',
  'git branch -D main',
  'git branch --force main other',
  'git log --output=evil.txt',
  'conciv tools page changes | tee evil.txt',
  'conciv ui confirm --question x',
]
```

Then assert `classifyCommand(cmd) === 'allow'` for every `ALLOW` entry and `=== 'ask'` for every `ASK` entry, using `it.each` or a `for...of` inside one `it`. Run the test — it MUST fail on the `env`/`find`/`git`-flag rows (that is the bug this plan fixes). If it already passes before you touch `gate.ts`, STOP and report drift.

**Verify**: `pnpm exec turbo run test --filter=@conciv/core` → the new rows fail (expected at this step).

### Step 2: Harden `classifyCommand`

Edit `packages/core/src/chat/gate.ts`:

1. **Remove `'env'` and `'find'` from the `READ_ONLY` set.** These have no safe-by-default form under a name-only check. (Losing auto-allow for benign `find`/`env` is acceptable — those now prompt, which is the correct conservative behavior.)
2. **Add `+`, `{`, `}` to the metacharacter screen** so it reads `/[;&|`$><\n{}+]/`. Keep the existing characters.
3. **Make the `git` branch flag-aware.** After confirming `tokens[1]` is in `GIT_READ_ONLY`, reject if any later token starts with `-` OR contains `=` (covers `-D`, `--force`, `--output=…`, `-f`). Only a subcommand with no dashed/`=` flags stays `'allow'`. Example target logic:

```ts
if (tokens[0] === 'git') {
  if (!GIT_READ_ONLY.has(tokens[1] ?? '')) return 'ask'
  const rest = tokens.slice(2)
  return rest.some((t) => t.startsWith('-') || t.includes('=')) ? 'ask' : 'allow'
}
```

Do not otherwise restructure the function. `conciv tools` stays allowed; the empty-string and generic `READ_ONLY.has(tokens[0])` paths are unchanged except for the two removed entries.

**Verify**: `pnpm exec turbo run test --filter=@conciv/core` → all rows pass, including the two original `it` blocks.

### Step 3: Confirm lint + typecheck + fallow are clean

**Verify**:

- `pnpm exec turbo run typecheck lint --filter=@conciv/core` → exit 0
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- File: `packages/core/test/chat/command-policy.test.ts` (expand the existing one — do not create a new file).
- Cases: every entry in the `ALLOW`/`ASK` tables above. The regression cases that prove this plan: `env` (bare and with program), `find -delete`/`-exec … +`/`-execdir`/`-fprintf`, `git branch -D`, `git branch --force`, `git log --output=`. Plus the pre-existing `ls`/`git status`/`git push`/`rm`/`conciv` cases, which must still hold.
- Structural pattern: the file already is the pattern; keep its import and `describe` layout.
- Verification: `pnpm exec turbo run test --filter=@conciv/core` → all pass, new rows included.

## Done criteria

ALL must hold:

- [ ] `pnpm exec turbo run typecheck lint test --filter=@conciv/core` exits 0
- [ ] `grep -n "'env'\|'find'" packages/core/src/chat/gate.ts` shows neither in the `READ_ONLY` set (they may appear in comments — there are none — or the git logic; confirm the set literal no longer lists them)
- [ ] The metacharacter regex in `gate.ts` includes `{`, `}`, and `+`
- [ ] `classifyCommand('env node -e "1"')`, `classifyCommand('find . -delete')`, and `classifyCommand('git branch -D x')` all return `'ask'` (asserted by the test)
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The `classifyCommand` source doesn't match the "Current state" excerpt (drift since this plan).
- The new test passes _before_ you edit `gate.ts` (means the code already changed — reconcile before proceeding).
- Removing `env`/`find` breaks an existing test elsewhere in `@conciv/core` (some test may assume `find` auto-allows) — report which test rather than weakening the fix.
- You find yourself wanting to add a real shell parser or re-broaden the allowlist to keep something passing — that is out of scope; report instead.

## Maintenance notes

- This classifier is deliberately conservative: it is an allowlist, and anything not provably read-only must `'ask'`. Future additions to `READ_ONLY`/`GIT_READ_ONLY` must be name-safe under an argument-blind check — if a command can execute or write via a flag/argument (like `env`, `find`, `xargs`, `sort -o`, `tee`), it does not belong in the set; gate it or add flag-aware handling like the `git` branch.
- A reviewer should scrutinize any PR that _adds_ entries to these sets or _removes_ characters from the metacharacter screen — those are the two ways this protection silently regresses. The characterization test is the guard; keep it exhaustive.
- Deferred out of scope: a proper shell-aware policy (parsing pipelines/subshells/quoting). The current metachar screen forces anything with shell composition to `'ask'`, which is safe but coarse; a real parser is a separate, larger effort.
