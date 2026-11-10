# Widget CSS: generated once per build, complete every time

## Problem

`@unocss/postcss` 66.12.0 keeps per-file scan state in its closure and shares it across every CSS file Vite compiles at
the same time (`dist/esm.mjs:94-102`). A compile marks a file as done before scanning it (`:169-170`) and resets the
shared promise list (`:156-157`, `:175-176`). A second compile running at the same moment skips files that are still
being scanned and generates CSS without their classes (`:178`).

We trigger this by compiling `apps/conciv/src/styles.css` (which holds `@unocss all`) twice per build:

- a plain import in `routes/__root.tsx:60`;
- a `?inline` import in `lib/shadow.ts:4`, `shell/pip.ts:4` and `shell/effects-surface.tsx:9`.

A harness that runs both compiles together loses 78-136 rules every time. The lost rules include `.-right-1`, `.-top-1`
and `[background:var(--chat-danger|warn)]`. Release builds are uncached and fully parallel, so they are the most
exposed. The variable order in `:root,:host` also changes on every build, so no two builds are byte-identical.

A separate cache bug: `packages/embed/uno.config.ts` scans `extensions/whiteboard`, `try-it` and `tanstack`, but none
of them is in embed's turbo inputs. `apps/conciv` has the same gap for whiteboard. An edit there leaves the turbo hash
unchanged, so stale CSS is served.

## Fix

1. **Library way.** Generate the utilities with `@unocss/vite` instead of `@unocss/postcss`, through
   `virtual:uno.css?inline` (production `?inline` support landed in 66.12.0, #5362). The plugin generates once per
   build, so there is no concurrent compile to race. `styles.css` keeps its own rules (reset, tokens, keyframes); the
   `@unocss all` slot becomes the virtual module. The shadow root, pip and effects surfaces receive the same combined
   string they get today.
2. **Order.** Both slots keep their order: the reset first, then tokens, then utilities.
3. **Unchanged surfaces.** The dev server (`pnpm dev:watch`, the example apps) and the vitest browser config (test-only
   scanning, added on `fix/firefox-multi-tool-perf` with `css.postcss`) must keep working. If tests need the vite plugin
   too, do it the same way.
4. **Fallback.** If open issue unocss#5414 (`content.filesystem` dropping utilities with `@unocss/vite` 66.11+) bites
   our setup, stop and report. The fallback is to compile `styles.css` once (drop the unused plain import), and it
   needs Omri's OK.
5. **Turbo inputs.** Every package a uno config scans is part of the owning package's build inputs, for both
   `packages/embed` and `apps/conciv`. Use workspace devDependencies if that is how the repo expresses build-graph edges
   elsewhere, otherwise turbo `inputs`. Check which one the repo uses.

## Proof

- **Race.** Run the race harness (`scratchpad/race.mjs`, adapted to the new pipeline) and several uncached
  `@conciv/embed` builds run serially. Every build must contain the full rule set: the selector set must equal a solo
  single-compile baseline (today 1380 rules, 138255 bytes), and the inline string must equal the file. Report whether
  builds are now byte-identical. If the variable order still varies, report its source.
- **Missed rules.** The rules that went missing in the race (`.-right-1`, `.-top-1`, the danger/warn backgrounds) are
  present.
- **Turbo.** An edit in `extensions/whiteboard` changes embed's turbo hash.
- **Tests.** The embed tests (vitest plus Playwright) and the conciv browser suite pass, and so does
  `pnpm --filter @conciv/embed test` (mount-externals guard).
- **Screenshots.** The widget panel, a session card with danger/warn, page pins, and the PiP/effects surface, headless,
  before and after.

## Rules

- Repo AGENTS.md: zero comments, no em dashes, the library way, no dependency patches, no git stash, no new test files.
