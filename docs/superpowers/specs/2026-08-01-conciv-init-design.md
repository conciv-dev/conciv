# conciv init — one-command project + harness setup

Decided 2026-08-01 (grilled interview, all forks resolved with the user).

## What it is

`npx conciv@latest init` sets up a project for conciv end to end: detects the
project's framework and every AI harness on the machine, installs the deps,
wires the bundler plugin and framework files, and wires every harness so that a
manually-started agent session in this project is conciv-connected. It tells
the user exactly what it did and how to use it. It does not run the user's app
and does not start agent sessions.

## Decisions (each user-approved)

1. **Definition of done: scaffold + verified-cheap + instruct.** Init exits
   after files/deps/config land and cheap static verification passes (files
   exist, deps resolve, configs parse). It prints what it did and the next
   steps (`pnpm dev`, `conciv open`). It never boots the user's dev server or
   an agent session. The pipeline leaves room to grow richer verification
   later (opt-in `--verify` / future `conciv doctor`), because every step
   already separates detect → plan → apply → verify.

2. **Package identity: the bare npm name `conciv`.** Verified unclaimed
   (registry 404). `@conciv/cli` is renamed/promoted to `conciv` — the front
   door. It keeps the agent-facing subcommands (`tools`, `open`, `page`) and
   gains `init`; its "internal, do not install" description is rewritten.
   `@conciv/it` remains the library dependency init installs into projects.
   Operational note: OIDC trusted publishing cannot create new npm names —
   the first `conciv` publish needs the manual bootstrap (same as the scope's
   first publish). Add `conciv` to `PUBLIC_PACKAGES` in
   `packages/publish/src/guards.ts`.

3. **Harness detection: all of them, consent via pre-checked multiselect.**
   Detect every installed harness (PATH presence + config markers:
   `~/.claude`, `~/.codex`, etc.). Show the found list, everything
   pre-checked, one keystroke confirms. No silent global writes; no invented
   "primary harness" concept.

4. **Harness wiring: every harness gets a real, project-scoped recipe.** The
   goal is that a user who types `claude` / `codex` / `pi` / `opencode` in
   this project tomorrow gets a conciv-connected agent (runtime
   `connect.plan()` only covers sessions conciv launches; init covers
   manually-started ones).
   - claude → `claude plugin install` via the native plugin manager (the FULL
     connect plugin from the connected-terminal work: skills, session MCP
     bridge, hooks). Native managers are preferred wherever a harness has one.
   - codex → project-level codex config carrying the conciv MCP server entry
     (+ trust settings). Project scope on purpose: never fight the runtime
     `-c` merge, never pollute `~/.codex`.
   - opencode → project config MCP entry.
   - pi → project-level tools/extension wiring.
   - all → a marked conciv section in `AGENTS.md`/`CLAUDE.md`
     (append-if-present with begin/end markers, create-if-missing) teaching
     the agent about `conciv tools`.
     Exact file formats per harness are verified against each CLI's current
     docs/behavior during implementation (a spike per harness, like the connect
     work did). Recipes live behind one interface; adding a harness = adding a
     recipe module.

5. **Framework wiring: confidence-gated codemods with a first-class manual
   fallback.** Detection from package.json deps (next, vite, webpack, rspack,
   rollup, esbuild — the quick-start set). Config edits (wrap default export
   with `withConciv`, add plugin to `plugins: []`, add imports) apply ONLY
   when the transform matches a shape it is sure about, and the applied diff
   is shown. Anything unrecognized degrades to a snippet card ("add this to
   your next.config.ts") — a styled, copy-paste instruction, not an error;
   the run still succeeds with that step marked "manual". Never a guessed
   half-edit. Framework recipes go beyond the config line where the
   quick-start does (Next.js: config wrapper + instrumentation/register files
   - client widget — three wires, per the quick-start).
   * Codemod engine: ast-grep (@ast-grep/napi) or magicast — implementer
     picks via a spike against the fixture corpus. Binding requirements
     regardless of library: no-match ⇒ no-edit (the confidence gate),
     minimal diffs that preserve surrounding formatting, and every transform
     tested against a fixture corpus seeded from the e2e consumer apps.

6. **Guardrails.** Refuse to run on a dirty git tree unless `--force` (every
   edit should be one `git diff` from reviewable). Idempotent re-runs:
   detecting existing wiring per step ⇒ "already wired", no duplicate edits.

7. **Modes + failure semantics.** `--yes` accepts all detected defaults
   (CI/scripts); `--dry-run` prints the full plan and touches nothing (free
   from the plan/apply split). A failing step mid-pipeline degrades to its
   manual card and the run continues, exiting 0 with a done/manual/failed
   summary. Hard abort only for preflight failures (no package.json, dirty
   tree without `--force`).

8. **UX stack.** citty (already the CLI's command tree) + @clack/prompts
   (wizard: multiselect, spinners, outro summary) + nypm (package-manager-
   agnostic installs — never print `npm install` at a pnpm user) + consola
   (logging) + the codemod engine above. New deps for the `conciv` package —
   user-approved as a class in this session.

## Shape of the pipeline

```
preflight (package.json, git state, workspace root)
  → detect   (framework, package manager, harnesses)
  → confirm  (clack wizard: pre-checked selections; --yes skips)
  → steps[]  each: {id, detect, plan, apply, verify, manualCard}
      - install @conciv/it (nypm)
      - framework recipe (config codemod + framework files)
      - per-harness recipes (claude plugin / codex / opencode / pi)
      - AGENTS.md/CLAUDE.md marked section
  → verify   (cheap static checks per step)
  → outro    (what happened, what's manual, next steps)
```

Each step is a self-contained module with one clear purpose; the pipeline
runner owns ordering, dry-run, and the done/manual/failed ledger.

## Out of scope (v1)

- Booting the user's app or a harness session as part of init (printed as
  next steps instead).
- Uninstall command (project-scoped writes are git-revertable; claude plugin
  uninstalls via its native manager).
- Monorepo target selection: v1 rule is "run from the app directory"; nypm
  handles workspace-root installs. Revisit if it bites.
- gemini harness (resume broken upstream; recipe slot exists when it heals).

## Testing

- Recipe/codemod transforms: fixture corpus (seeded from the 8 e2e consumer
  apps + hand-made weird-config fixtures), node tests per transform: match ⇒
  exact expected diff; no-match ⇒ untouched + manual card.
- Pipeline: node tests over a temp dir per framework fixture — full init run
  (with `--yes`) asserts the file set, package.json delta, idempotent second
  run, dirty-tree refusal.
- Harness recipes: testkit-style fakes for the harness CLIs (PATH shims), as
  the connect work does; claude recipe asserts the plugin-manager invocation,
  not hand-written files.
- E2e: one consumer-app spin-up per framework in the existing e2e suite
  running real `conciv init --yes` and booting the result.
