# Plan 005: Add a root `AGENTS.md` capturing non-discoverable conventions

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2446924..HEAD -- AGENTS.md package.json turbo.json`
> If an `AGENTS.md` already exists, treat it as a STOP condition (don't overwrite).

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / docs
- **Planned at**: commit `2446924`, 2026-06-16

## Why this matters

This repo's whole purpose is agents executing work, and several conventions here are **not discoverable
from the code**: the build/test ordering quirk, the no-jsdom rule, the prebuilt-bundle requirement for
widget tests, the capability-typed harness union, the formatter/linter choice, and a few hard
"never"s. A root `AGENTS.md` puts the high-signal, non-obvious rules in one place so any agent (or new
contributor) avoids the common mistakes. Keep it short and high-signal — omit anything inferable from
README/config/code.

## Current state

- No `AGENTS.md` or root `CLAUDE.md` exists.
- Verified facts to encode (all confirmed from this repo at `2446924`):
  - **Package manager / runtime**: pnpm `10.33.2` (`package.json` `packageManager`), Node `>=22`.
  - **Build/typecheck/test/lint/format** are turbo-orchestrated: `pnpm build|typecheck|test|lint`,
    `pnpm format:check` (oxfmt) / `pnpm format` (write). Per package: `tsc -p tsconfig.json --noEmit`,
    `oxlint`, `vitest run`.
  - **`turbo run test` `dependsOn` `build`** — tests need built deps; don't hand-rebuild `dist/`, use
    turbo.
  - **Lint = oxlint, format = oxfmt** (configs: `.oxlintrc.json`, `.oxfmtrc.json`; printWidth 120, no
    semicolons, single quotes, no bracket spacing, trailing commas all).
  - **TS is strict** (`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
    `isolatedModules`, NodeNext). No `any`/`as`/`@ts-ignore` casual escapes.
  - **Widget tests run in a real browser (Playwright/Chromium) against the prebuilt bundle**
    (`packages/widget/dist/aidx-widget.global.js`): rebuild the bundle before running widget IT, or the
    test runs stale code. Use `browser.newPage()` (NOT `newContext()`). **Never** use jsdom/happy-dom.
  - **Harness adapters are capability-typed**: `HarnessAdapter` is a discriminated union where
    `capabilities.transcriptHistory: true` ⇒ `history` is required and `capabilities.compaction: true`
    ⇒ `buildCompactArgs` is required (compile-time enforced — see `packages/protocol/src/harness-types.ts`).
    Add a harness by implementing the capability contract, never by special-casing a CLI in core/widget.
  - **zod validates every HTTP boundary** (`readValidatedBody` in `packages/core/src/api/**`).
  - **Secrets**: never commit/log credentials; the server binds `127.0.0.1` only.
  - **Code style rules from the maintainer**: functions, not classes (the one `BaseTextAdapter` subclass
    in `packages/harness/src/_shared/text-adapter.ts` is a documented exception); no IIFEs unless asked;
    comments are one concise line, never multi-line blocks.
  - **Pre-release (v0)**: no external users — APIs may be reshaped freely with all call sites updated;
    no back-compat shims.
- A `superpowers:init` / `init` skill exists for generating AGENTS.md; the executor MAY invoke it, but
  the content below is sufficient and authoritative for this repo.

## Commands you will need

| Purpose                                             | Command             | Expected on success |
| --------------------------------------------------- | ------------------- | ------------------- |
| Format check (ensure the new file doesn't break it) | `pnpm format:check` | exit 0              |

## Scope

**In scope**:

- `AGENTS.md` (create at repo root)

**Out of scope** (do NOT touch):

- README.md (it documents the product/packages; AGENTS.md is for working _in_ the repo — don't
  duplicate the package table).
- Any code or config. This plan adds one doc file only.
- Do NOT restate things discoverable from README/config (e.g. the package list, the quickstart).

## Git workflow

- Branch: `advisor/005-agents-md`
- One commit. Conventional commits (e.g. `docs: add AGENTS.md with repo conventions`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write `AGENTS.md`

Create `AGENTS.md` at the repo root with these sections (keep it tight — bullets, not prose). Use the
verified facts from "Current state"; do not invent rules not listed there.

```markdown
# AGENTS.md

Conventions for agents and contributors working in this repo. Product/architecture overview lives in
README.md; this file is the non-obvious operational rules.

## Toolchain

- pnpm 10.33.2, Node >= 22. Monorepo orchestrated by turbo.
- Build: `pnpm build`. Typecheck: `pnpm typecheck`. Test: `pnpm test`. Lint: `pnpm lint`
  (oxlint). Format: `pnpm format:check` / `pnpm format` (oxfmt).
- `pnpm test` builds first (`turbo run test` dependsOn `build`). Don't hand-rebuild `dist/` — use turbo.

## Code style

- Functions, not classes. (Sole exception: the `BaseTextAdapter` subclass in
  `packages/harness/src/_shared/text-adapter.ts`, which the library's typing forces.)
- No IIFEs unless explicitly required.
- Comments: one concise line. No multi-line comment blocks.
- TypeScript is strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext). Avoid
  `any`/`as`/`@ts-ignore`.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.

## Testing

- Widget UI is tested in a REAL browser (Playwright/Chromium), never jsdom/happy-dom.
- Widget integration tests load the PREBUILT bundle (`packages/widget/dist/aidx-widget.global.js`):
  rebuild the widget (`pnpm turbo run build --filter=@opendui/aidx-widget`) before running them, or you test
  stale code.
- In widget ITs use `browser.newPage()`, not `newContext()` (contexts leak and spike CPU/memory).
- zod validates every HTTP boundary (`readValidatedBody`); add validation for new routes.

## Harness & runner adapters

- `HarnessAdapter` is capability-typed (`packages/protocol/src/harness-types.ts`): `transcriptHistory:
true` ⇒ `history` required; `compaction: true` ⇒ `buildCompactArgs` required — enforced at compile
  time. Add a harness by satisfying the capability contract; never special-case a CLI in core/widget.
- Test runners follow the same registry/stub pattern.

## Security & safety

- The core dev server binds `127.0.0.1` only. Never commit or log credentials/tokens.
- Risky Bash from the agent is gated (`packages/core/src/api/chat/permission.ts` +
  `policy/command-policy.ts`) — read-only commands auto-allow, everything else asks. Keep that policy
  conservative when editing it.

## Project status

- Pre-release (v0), no external users: reshape internal APIs freely and update all call sites; no
  back-compat shims.
```

**Verify**: `test -f AGENTS.md && grep -q "Widget integration tests load the PREBUILT bundle" AGENTS.md && echo ok` → prints `ok`

### Step 2: Confirm formatting is unaffected

**Verify**: `pnpm format:check` → exit 0 (oxfmt ignores Markdown, so this should be unchanged; if it
errors about `AGENTS.md`, STOP and report — the formatter config changed).

## Test plan

No tests (documentation). Verification is the two checks above.

## Done criteria

ALL must hold:

- [ ] `AGENTS.md` exists at the repo root with all sections from Step 1
- [ ] `pnpm format:check` exits 0
- [ ] Only `AGENTS.md` is added (`git status --porcelain` shows just that file)
- [ ] `plans/README.md` row for 005 updated

## STOP conditions

Stop and report (do not improvise) if:

- An `AGENTS.md` or root `CLAUDE.md` already exists (don't overwrite — report and ask).
- `pnpm format:check` flags `AGENTS.md` (formatter now covers Markdown — report so the content can be
  reflowed).

## Maintenance notes

- Keep this file SHORT and high-signal. When a convention becomes discoverable (e.g. encoded in a lint
  rule), remove it from here.
- Reviewer: verify every bullet is true at merge time and not duplicating README.
