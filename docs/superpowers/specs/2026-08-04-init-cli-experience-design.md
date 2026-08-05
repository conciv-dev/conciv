# conciv init — CLI experience design

Status: DRAFT — awaiting user approval. Supersedes the ad-hoc UX amendments attempted on 2026-08-04.

User rulings this design binds to (verbatim):

1. "ideally if we can detect all the command will just print first what it is going to do, have the user approve or change, on approve, we run what were able to detect"
2. "also no loading... let's think of all the loading state, error, everything must be covered"
3. "make sure to use all of clack built in!!! do not invent any CLI stuff yourself"
4. "this output is terrible.. no colors, no nothing"

Reference: TanStack CLI (github.com/TanStack/cli), source-read 2026-08-04 — also @clack/prompts-based; validates the platform choice and three specifics: (1) an injectable Environment UX seam (their `ui-environment.ts`) exactly like our InitRuntime; (2) the `diff` package + line colorization for applied-change display (never hand-rolled); (3) clack select/multiselect/note/cancel idioms matching this design. We use @clack/prompts 1.7.0 primitives exclusively for terminal UX, picocolors (clack's own color lib, declared as a direct dep) for the diff colors clack doesn't own, and the `diff` package for patch computation.

## The five phases

Every run moves through: **intro → detect → plan → execute → outro**. `--dry-run` stops after plan. `--yes` auto-approves the plan. Preflight refusal aborts inside detect.

### 1. Intro

`intro('conciv init')` — clack's standard opener. Nothing else. No ASCII art, no banner.

### 2. Detect (spinner state)

One clack `spinner`: `Detecting your project…` → stops with a one-line result:
`Detected: vite (vite.config.ts) · pnpm · harnesses: claude, codex`.

- Preflight refusal: spinner stops with `log.error(reason)` (exact existing reason strings), `outro` styled as failure, exit 1. The only exit-1 paths are preflight and non-TTY-without---yes.
- Nothing detected (unknown framework, no harnesses): NOT an error — the plan simply shows the manual-card steps that will run.

### 3. Plan (the core artifact — ruling 1)

Rendered BEFORE any question, from the pipeline's existing per-step `plan()`:

```
◇ Plan ──────────────────────────────────╮
│ ◆ Install @conciv/it            package.json          │
│ ◆ Wire the vite config          vite.config.ts        │
│ ◆ Teach agents the conciv CLI   AGENTS.md             │
│ ◆ Install the claude plugin     claude plugin manager │
│                                                       │
│ Harnesses: ● claude  ● codex  ○ opencode (not found)  │
╰───────────────────────────────────────╯
```

(clack `note` with a two-column body; already-wired steps appear dimmed with `already wired`; steps that can only card appear as `manual — prints instructions`.)

Then ONE decision — clack `select`:

- **Proceed** → execute.
- **Adjust** → harness `multiselect` (pre-checked with found ones) + framework `confirm`, then the plan re-renders and the select asks again. Loop until Proceed/Cancel.
- **Cancel** (or Esc/ctrl-C anywhere via `isCancel`) → `cancel('Nothing changed.')`, exit 0.

Flag behavior: `--yes` prints the plan and proceeds without the select. `--dry-run` prints the plan and exits 0 with `outro('Dry run — nothing changed.')`.

### 4. Execute (live checklist — ruling 2)

clack `tasks` runs the steps sequentially: each renders as an active spinner line with the step title, resolving in place. Result vocabulary (clack's own symbols/colors, ruling 3+4):

- done → `S_SUCCESS` green line, e.g. `Wired vite.config.ts`
- already → green line `Already wired — skipped`
- manual → `log.warn` amber line `Needs a manual step (card below)` — visible AT the step, not only in the outro
- skipped → dim line with the reason (`not selected`)

Named slow operations inside steps (the blank-cursor bug): the install step's task title is `Installing @conciv/it with pnpm…`; the claude step's is `Installing the claude plugin…`. If clack `tasks` cannot express a non-throw manual resolution, the fallback is per-step `spinner` + `log.*` lines — still clack-only.

**Applied-diff rendering:** after a config edit, the diff prints under the step via `note` titled with the filename. Colors via picocolors: green `+`, red `-`, dim/cyan `@@`. **The hand-rolled `unifiedDiff` is DELETED** — its single-hunk prefix/suffix model collapses two disjoint edits (import at top + plugin lower) into a whole-file re-print, the exact bug the user hit. Replacement per the TanStack CLI precedent (`packages/cli/src/file-syncer.ts` uses `diff.createPatch`, `dev-watch.ts` colorizes its lines): the `diff` npm package's `structuredPatch` with 2 context lines — proper per-region hunks by construction. One new dependency (`diff` — zero-dep, ubiquitous, the platform primitive for this job; requires user approval).

### 5. Outro

- Manual cards: each is a clack `note` (title = card title, body + snippet) — the hand-rolled `┌─┐` box in cards.ts is deleted; `renderCard` becomes a note-payload builder.
- Summary line via `log.success` / `log.warn`: `3 wired · 1 manual step below`.
- `outro` carries next steps: `Start your app: pnpm dev`, `Ask your agent to run: conciv tools --help`, and a link to conciv.dev/docs/quick-start when any card printed.

## Full state matrix (ruling 2 — nothing uncovered)

| Situation                                        | Behavior                                                                                                            | Exit |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---- |
| Happy path                                       | five phases                                                                                                         | 0    |
| `--dry-run`                                      | plan printed, nothing touched                                                                                       | 0    |
| `--yes`                                          | plan printed, auto-proceed                                                                                          | 0    |
| Preflight: no package.json / dirty tree          | spinner→`log.error` exact reason, failure outro                                                                     | 1    |
| Non-TTY without `--yes` (CI, agents)             | clack `isTTY`/`isCI`: print `Non-interactive terminal — re-run with --yes or --dry-run`, never hang                 | 1    |
| Cancel/Esc/ctrl-C during any prompt              | `cancel('Nothing changed.')`                                                                                        | 0    |
| ctrl-C during execute                            | SIGINT handler active only during apply: restore config backup, `cancel('Interrupted — your config was restored.')` | 130  |
| Step throws / registry down / no package manager | step line resolves amber, pipeline continues, card in outro                                                         | 0    |
| Codemod can't prove config shape                 | same manual path, card carries the exact snippet                                                                    | 0    |
| Re-run on a wired project                        | every step `Already wired`, outro says so, zero writes                                                              | 0    |
| Unknown framework                                | plan shows the manual-card step honestly; no fake confidence                                                        | 0    |
| No harnesses found                               | harness row says `none found`, agents-md step still plans (section useful regardless)                               | 0    |
| NO_COLOR / dumb terminal                         | picocolors auto-disables; clack degrades; no hand-rolled detection                                                  | —    |

## Explicitly out

- No ASCII-art banner, no gradient text, no emoji spam — clack's visual language only.
- No new UX deps beyond declaring picocolors (already in the store via clack).
- consola: removed if clack `log` covers every call site after this change (expected); kept only if a real non-UX logging need remains.

## Testing

- Wizard/checklist logic through the existing InitRuntime prompts/output seams (boundary injection; the real default is clack) — no clack mocking.
- Diff fix: unit-test unifiedDiff on the vite fixture pair proving the insertion renders ≤ (inserted + 4 context) lines, plus the two-edit-regions case.
- State matrix rows each get a test at the highest honest level: unit for diff/non-TTY/SIGINT wiring, the e2e/init suite for --yes/--dry-run real-binary output (it asserts real stdout strings from the plan preview).
