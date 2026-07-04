<!-- intent-skills:start -->

## Skill Loading

Before substantial work:

- Skill check: run `pnpm dlx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# AGENTS.md

Conventions for agents and contributors working in this repo. Product/architecture overview lives in
README.md; this file is the non-obvious operational rules.

## Toolchain

- pnpm (exact version pinned in root `package.json` `packageManager`), Node >= 22. Monorepo orchestrated by turbo.
- Build: `pnpm build`. Typecheck: `pnpm typecheck`. Test: `pnpm test`. Lint: `pnpm lint`
  (oxlint). Format: `pnpm format:check` / `pnpm format` (oxfmt).
- `pnpm test` builds first (`turbo run test` dependsOn `build`). Don't hand-rebuild `dist/` — use turbo.
- Commit hooks: `prek` (devDep `@j178/prek`, config `.pre-commit-config.yaml`) runs oxfmt + oxlint on
  staged files. `pnpm install` auto-activates the hook via the `prepare` script — no per-clone step.
  Whole-project gates (typecheck/build/test) are not in hooks — run them manually.
- Dev loop (`pnpm dev`): widget/UI edits only need a browser hard reload; edits to core, harness, or
  tool packages need the dev server restarted — a reload alone runs stale server code.

## Code style

- Functions, not classes. (Sole exception: the `BaseTextAdapter` subclass in
  `packages/harness/src/_shared/text-adapter.ts`, which the library's typing forces.)
- No IIFEs unless explicitly required.
- Zero code comments in TS/JS (only tool directives like `@ts-`/`eslint-` survive). The
  `conciv/no-comments` lint rule autofix-DELETES anything else — don't write comments and let lint
  strip them; write self-explanatory code.
- TypeScript is strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext). Avoid
  `any`/`as`/`@ts-ignore`.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.

## Testing

- Widget UI is tested in a REAL browser (Playwright/Chromium), never jsdom/happy-dom.
- Widget integration tests load the PREBUILT bundle (`packages/widget/dist/conciv-widget.global.js`):
  rebuild the widget (`pnpm turbo run build --filter=@conciv/widget`) before running them, or you test
  stale code.
- In widget ITs use `browser.newPage()`, not `newContext()` (contexts leak and spike CPU/memory).
- Never wait for Playwright `networkidle` on a page with the live widget — its SSE stream keeps the
  network busy forever; wait for `domcontentloaded` (or a UI signal) instead.
- zod validates every HTTP boundary (`readValidatedBody`); add validation for new routes.

## Harness & runner adapters

- `HarnessAdapter` is capability-typed (`packages/protocol/src/harness-types.ts`): `transcriptHistory:
true` ⇒ `history` required; `compaction: true` ⇒ `buildCompactArgs` required — enforced at compile
  time. Add a harness by satisfying the capability contract; never special-case a CLI in core/widget.
- Test runners follow the same registry/stub pattern.

## Security & safety

- The core dev server binds `127.0.0.1` only. Never commit or log credentials/tokens.
- Risky Bash from the agent is gated (`packages/core/src/api/chat/permission.ts` +
  `packages/core/src/policy/command-policy.ts`) — read-only commands auto-allow, everything else
  asks. Keep that policy conservative when editing it.

## Project status

- Pre-release (v0), no external users: reshape internal APIs freely and update all call sites; no
  back-compat shims.
