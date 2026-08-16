# conciv.dev landing redesign — implementation plan (v2, after Codex plan review)

Spec: `docs/superpowers/specs/2026-08-15-landing-redesign-design.md` (now v5). Branch `feat/landing-redesign`, worktree `/Users/omrikatz/Public/web/aidx-landing-redesign`. One implementer (conciv-site agent) executes tasks in order; the orchestrator reviews the diff after tasks 3, 6 and 9.

Every task ends with: `pnpm --filter=site typecheck` green, `pnpm exec fallow audit --format json --quiet --explain --gate-marker agent` verdict not `fail`, then a commit with pathspec (`git add <files>`, never `git add -A`, never `git stash`). Bash cwd resets to the repo root after each command — use absolute paths.

Assets already in place (do not regenerate): `apps/site/public/screenshots/{grab-element,edit-live,test-run,permission,whiteboard,any-running-app,fab-closed}.webp` + `index.json`. `hero-demo.webp` is produced in task 7.

## Status (2026-08-16)

Tasks 0 to 6 are done and committed on `feat/landing-redesign`. Nothing is pushed. Tasks 7, 8 and 9
are in progress in the current pass, split across three agents working on the same worktree.

Task 7, evidence captures. Own Chromium (never the user's browser, never `networkidle`), 1440x900
and 390x844, light and dark, DPR 2, `prefers-reduced-motion: no-preference`, zero console errors,
written to `scratchpad/landing-evidence/`. `hero-demo.webp` was already re-shot from the running demo
and is in `public/screenshots/` with its `index.json` entry.

Task 8, tests. `test/mobile-gating.it.test.ts` (rewritten to the new contract on `browser.newPage()`),
`test/landing-install-command.it.test.ts` and `test/landing-sections.it.test.ts` exist but have not
been run. Still to add per the two Codex reviews: overflow at 320/375/414/768/1024/1280/1440, the
poster persisting until the demo reports ready, the shader static under reduced motion, the lightbox
keyboard flow, and a rapid tab-switch interrupt. Run with:

- `pnpm exec turbo run test --filter=site --force`
- `pnpm exec turbo run test:e2e --filter=site --concurrency=1`

If `site#build` prerender dies with `_cf_ALARM`, kill any `wrangler dev` in this worktree and
`rm -rf apps/site/.wrangler/state` first (two workerd versions share that state directory).

Task 9, gates and PR. In order:

- `pnpm --filter=site typecheck`
- `pnpm --filter=site lint`
- `pnpm format`
- `pnpm exec fallow audit --changed-since main --format json` (nothing INTRODUCED)
- `21st review apps/site/src/components/landing`
- `pnpm exec conciv-publish check-changesets --require-coverage --base origin/main` (`apps/site` is
  private, so report the outcome rather than assuming one)

Then push and open the draft PR `feat(site): landing redesign — Zed-structured, product-led`.

One design decision is still open and blocks nothing: the capability section restructure into two
annotated product stories plus an evidence strip. The mock is `scratchpad/capability-mock-a.png` and
the owner has it; the shipped grid stays 2 / 3 / 1 until he calls it.

## Task 0 — Environment (done)
- `pnpm install --frozen-lockfile` in the worktree. Do NOT run a separate build gate; `turbo run test` builds. For the dev server: `pnpm --filter=site dev` serves `http://localhost:3001` (from `apps/site/package.json`); if the port is taken use `--port <free>` and note it. Site tests: unit = `pnpm exec turbo run test --filter=site`; browser ITs = `pnpm exec turbo run test:e2e --filter=site --concurrency=1` (the fixture `test/site-fixture.ts` starts Wrangler over the built site).
- Read AGENTS.md, the spec, `apps/site/src/styles/app.css`, `apps/site/src/components/landing/*`, `apps/site/src/lib/use-media-query.ts`, `use-is-mobile.ts`, `apps/site/test/*`, `apps/site/vitest*.config.ts`, `apps/site/vite.config.ts`.

## Task 1 — Type + tokens (done)
- `pnpm --filter=site add @fontsource-variable/newsreader @fontsource-variable/jetbrains-mono`; import both in `app.css`; delete the Google Fonts `@import`, the Bricolage `@import`, `public/fonts/BricolageGrotesque-*.ttf`, `public/fonts/LICENSE-Bricolage-Grotesque.txt`; grep the whole `apps/site` for `Bricolage` and fix every reference.
- `--od-display: 'Newsreader Variable', serif`; `--od-mono: 'JetBrains Mono Variable', ui-monospace, monospace`. Add the classes the design needs (`.od-h1`, `.od-h2`, `.od-eyebrow`, container column rules, `.od-screenshot` dark-mode keyline/matte) in `app.css`, following how the file already defines utilities. Remove the gradient surface at `app.css` ~123-130 if it exists only for the old landing (grep users first).
- Commit `feat(site): serif display + self-hosted mono, drop Bricolage`.

## Task 2 — Reveal + hydration-safe media query (done; the `Reveal` primitive was removed again in `39ef9c4a`, since SSR shipped it as `opacity: 0`)
- `reveal.tsx`: `m.div` `whileInView` fade-up 12px/400ms/ease-out `once`; `useReducedMotion` → static. Uses `LandingMotion` from `lazy-motion.tsx`.
- Extend `use-media-query.ts` / `use-is-mobile.ts` to a tri-state (`undefined` until the client knows, then boolean) without breaking existing callers (docs pages may use it — grep). Server snapshot must be `undefined`.
- `landing-page.tsx` stays wired to the OLD sections for now (typecheck must stay green); only add the container with column rules and drop `SmoothScroll`/`ClickSpark` wrappers.
- Commit `feat(site): reveal primitive, tri-state media query, landing container rules`.

## Task 3 — Hero: `install-command.tsx`, `hero.tsx` (HeroCopy), `product-frame.tsx` (done)
- `install-command.tsx` per spec §1. Tabs: use `radix-ui` `Tabs` primitives directly (as `framework-tabs.tsx` already does) — no shadcn generator, no network. SSR npm; `useEffect` reads `localStorage['conciv.pm']`; copy `await navigator.clipboard.writeText` in try/catch; `aria-live="polite"` region; `compact` prop (mobile: no tabs, command + copy button stay).
- `copy-button.tsx`: fix to await + catch + live region (it is also used by `framework-tabs.tsx`); or replace both usages with one implementation — one good way, not two.
- `hero.tsx` → HeroCopy: eyebrow, `export const HERO_HEADLINE`, h1, sub, action row (`InstallCommand`, `TryLiveButton`), mobile gating per spec using the tri-state hook.
- `product-frame.tsx`: chrome dots `aria-hidden` + `localhost:3000` field, `aspect-[16/10]` reserved box; `undefined` → box only; desktop → `ClientOnly` + lazy `Demo`; mobile → `<img src="/screenshots/hero-demo.webp" width={1440} height={900} alt="…">`. Lazy import lives inside the desktop branch component so mobile never requests the chunk or the model worker.
- `demo/*` restyle (behavior unchanged): app preview LEFT, chat RIGHT at ≈420px, remove the demo's own card chrome/glow/shadow (the frame provides chrome now), dark always.
- Wire HeroCopy + ProductFrame into `landing-page.tsx` (replacing `Hero`).
- Commit `feat(site): hero copy, install command with pm tabs, product frame`.
- **Orchestrator review checkpoint 1.**

## Task 4 — Principles strip + Capability section (done)
- `principles-strip.tsx` per spec §2 (copy verbatim).
- `capability-section.tsx` per spec §3: `import screenshots from '../../../public/screenshots/index.json'` (resolveJsonModule is on) — figures take `width/height/alt` from it; captions from the spec table (edit-live caption = "Try it live first" as in spec v3). Rows A/B/C responsive classes; `.od-screenshot`.
- Wire into `landing-page.tsx`, drop `FeaturesSection`; then `pnpm exec fallow dead-code --trace apps/site/src/components/landing/features-section.tsx:FeaturesSection` and, for each `ui/*-icon.tsx` it used, `--trace <file>:default`; delete only what traces dead.
- Commit `feat(site): principles strip and image-led capability section`.

## Task 5 — How it works + Open source ledger + nav/footer (done)
- `how-it-works.tsx` per spec §4. `framework-tabs.tsx`: strip the animated pill, the magic-move transition, and the gradient edge fades (spec motion rule) — tab switch is instant; snippet data untouched; keep `soon`/alpha labels. Step 3 mono block + `fab-closed.webp` figure; hotkey copy per spec (product default `Mod+\``; the site's own `Alt+k` override in `vite.config.ts` is irrelevant to the copy).
- Wire in; then trace + delete `bundler-band.tsx` and `LogoLoop.tsx`.
- `github-star-link.tsx`: export a `StarCount` (count-only presentation) or `useStarCount`; `open-source-strip.tsx` per spec §5 uses it.
- `site-nav.tsx`, `site-footer.tsx`: hairline rules, mono labels; remove the footer's animated iframe/gradient surface (spec: footer static, no gradients) — check what that iframe is for first and report if it is product-relevant.
- Commit `feat(site): how-it-works as numbered doc, open-source ledger, static nav/footer`.

## Task 6 — Delete the rest, deps, asset cleanup (done)
- Trace (`fallow dead-code --trace <file>:<export>`) then delete: `ClickSpark.tsx`, `SplitText.tsx`, `VariableProximity.tsx`, `Magnet.tsx`, `AnimatedContent.tsx`, `smooth-scroll.tsx`, `install-chip.tsx`, `robot-fab.tsx` (if unused).
- `pnpm exec fallow dead-code --trace-dependency lenis` → if unused, remove from `apps/site/package.json` and `pnpm install` (lockfile updates). Keep `gsap`, `@gsap/react`.
- Legacy PNGs in `public/screenshots/`: grep each filename across `apps/site` and `content/`; delete only unreferenced ones; list kept/deleted in the report.
- `pnpm exec fallow audit --changed-since main --format json` — zero INTRODUCED. `pnpm lint`, `pnpm format`.
- Commit `chore(site): remove reactbits effects, lenis, unreferenced screenshots`.
- **Orchestrator review checkpoint 2.**

## Task 7 — Visual evidence + `hero-demo.webp` (in progress, agent 3)
- Dev server up; Playwright with your OWN Chromium (never the user's browser; never `networkidle`): capture the ProductFrame element at 1440 CSS px, DPR 2, demo settled (wait on a UI signal) → `public/screenshots/hero-demo.webp` 1440×900 q82; add its `index.json` entry (source: "site demo capture", crop null).
- Full-page captures 1440×900 and 390×844, light + dark, reduced-motion off, DPR 2, zero console/page errors → scratchpad `landing-evidence/`; list paths in the report.
- Commit `feat(site): mobile hero screenshot`.

## Task 8 — Tests (in progress, agent 3)
- `test/mobile-gating.it.test.ts`: new contract (tabs + Try live absent; command + copy button present; `hero-demo.webp` `img` rendered; demo chunk / `model.worker` never requested — assert via `page.on('request')` collected list) and `browser.newPage()` instead of `newContext()`.
- `test/landing-install-command.it.test.ts`: `page.context().grantPermissions(['clipboard-read','clipboard-write'])`; tab switch updates command; arrow keys move tabs; copy → clipboard has command + live region "Copied"; persists across reload (assert settled value); failure path (override `navigator.clipboard.writeText` to reject via `page.addInitScript`) shows failure text.
- `test/landing-sections.it.test.ts`: h1 = `HERO_HEADLINE`; 6 capability figures with non-empty alt and intrinsic width/height; three how-it-works numerals; ledger renders the star count; zero page errors.
- Web-first assertions only; no sleeps, no `expect.poll`, no CSS-detail assertions, no test ids. Green: `pnpm exec turbo run test --filter=site` and `pnpm exec turbo run test:e2e --filter=site --concurrency=1`.
- Commit `test(site): landing ITs — install command, sections, mobile gating`.

## Task 9 — Gates + `21st review` + PR (in progress, agent 3)
- Run every gate in spec "Gates before PR"; paste last lines of each output in the report. `21st review apps/site/src/components/landing`: apply only safe fixes, list the rest.
- `pnpm exec conciv-publish check-changesets --require-coverage --base origin/main` — report the outcome (expected: not required; site is private).
- Push; open PR `feat(site): landing redesign — Zed-structured, product-led` with summary, spec + plan links, before/after (before = `scratchpad/landing-full.png` provided by the orchestrator), test list, gate outputs, follow-ups (Rollup/esbuild snippets, light captures).
- **Orchestrator review checkpoint 3**, then hand to Omri.

## Rules the implementer must not break
Functions not classes; zero comments; no `any`/`as`/non-null; es-toolkit for collection transforms; kebab-case files; `useEffect` only for the two hydration reads (localStorage pm; media query subscription); no new deps beyond the two fonts; no `git stash`; commit with pathspec; absolute paths; never run npm-builtin-named scripts bare (`pnpm run <script>`); never open the user's browser; kill only own dev server by LISTEN pid; fallow gate before every commit.
