# conciv.dev landing redesign — design spec (v4, component-registry pass)

Date: 2026-08-16. Owner: Omri. Status: approved direction ("terminal-first / Zed-structured", palette "dark product windows on paper"). v2 folds in the 36 findings of the Codex spec review (`gpt-5.6-sol`, read-only, this worktree). v3 dropped the `Reveal` whileInView primitive (SSR bakes `opacity:0` into the HTML, invisible until JS/IntersectionObserver runs — bad for crawlers, no-JS, LCP; static page instead). v4 requires every UI element to come from a component registry (21st.dev, smoothui.dev, kokonutui.com, shadcn) adapted to `--od-*` tokens, hand-written code reserved for page layout containers and copy — see the Components section for the source mapping, including the components evaluated and rejected as a bad fit for this design system.

## Goal

Replace the current landing page (`apps/site/src/components/landing/*`) with a page that reads like a serious developer-tool site (reference: zed.dev structure, Bun/Warp confidence), not a template. Product screenshots and the live demo carry the page; type and rules carry the hierarchy. Primary conversion: copy the install command and follow Quick start. Audience: frontend developers already using Claude Code / Codex.

Non-goals: docs pages, widget changes, new product features, dark-mode redesign of the widget. The site keeps its stack (React 19, TanStack Start, Tailwind v4, shadcn radix-nova, Cloudflare Workers).

## Truth rules for copy (every claim must hold today)

- Claude Code is the default harness; Codex is supported. Say "Connect Claude Code or Codex", never "mounts Claude Code or Codex".
- Bundlers: say only what `apps/site/src/components/landing/framework-snippets.ts` has real code for. Rollup/esbuild are `soon` there; iOS is alpha. Do not list six bundlers as shipped. Use "one integration", not "one plugin line", except for the Vite-specific screenshot caption.
- Privacy: "Your code and prompts never pass through conciv servers. The local engine binds to localhost." Never "prompts never leave localhost" (the agent provider receives them) and never "0 servers" (a local Hono engine runs).
- Keys: "No conciv account or API key — bring your own authenticated Claude Code or Codex CLI." Never "no keys to paste".
- Tests: "Run Vitest or Playwright locally; results render as cards in the thread." Not "Vitest runs in-app".
- Diffs: "Source edits render as readable diff cards in the thread." No "before it lands" (there is no staging workflow).
- Banned words: supercharge, seamlessly, 10x, revolutionize, unlock, effortless, "it just works". Sentence case titles, no exclamation marks. Product is Beta — keep the word somewhere near the top.

## Visual system

- Palette unchanged: `--od-paper` / `--od-ink` / `--od-muted` / `--od-line` / `--od-accent` (red) with the existing dark-mode values. Red is reserved for: eyebrow labels, the spark mark, one primary button, link hover, step numerals, and the existing focus/selection/status affordances (`primary`, `ring`, caret) that already map to it in `app.css`. No new red surfaces.
- Product imagery is always a dark window. On the light page it sits directly on paper; in dark mode every screenshot gets a 1px `--od-line` keyline plus a 4px matte in `--od-panel` so the window still reads as an object. Never recolor screenshots; never place a light-widget capture.
- Type:
  - Display (h1, section h2): serif — `@fontsource-variable/newsreader` (decided; no bake-off). h1 italic 400, tracking `-0.02em`, leading 1.02, `clamp(44px, 5.4vw, 68px)`. h2 upright 400, `clamp(30px, 3.2vw, 40px)`. CSS fallback = generic `serif` only.
  - Body/UI: `Geist Variable` (installed).
  - Mono: `@fontsource-variable/jetbrains-mono` self-hosted; remove the Google Fonts `@import` in `app.css`, the Bricolage `@import`, `public/fonts/BricolageGrotesque-*.ttf`, and `public/fonts/LICENSE-Bricolage-Grotesque.txt`.
- Grid: `max-w-[1180px]` container. Zed-style hairline column rules: the container has 1px `--od-line` borders left/right from hero to footer (hidden under `md`), and every section is separated by a full-width 1px rule. Section eyebrows are mono, uppercase, `tracking-[0.18em]`, 11.5px, red — but sections do NOT share one heading anatomy (see structure): capabilities is image-led, how-it-works is a numbered technical document, open source is a compact ledger. No generic `section.tsx` wrapper.
- Radius: 10px for frames/tiles, 6px for chips/buttons. Shadow: `0 1px 0 rgba(0,0,0,.04), 0 24px 48px -24px rgba(0,0,0,.25)` on the hero product frame only. Tiles are border-and-caption figures (1px `--od-line`, no chrome, no shadow).
- Motion: static page, Zed-style — no entrance animation anywhere (no `whileInView` fade-up, no `Reveal` primitive; `motion`'s `initial={{opacity:0}}` bakes into the SSR HTML and leaves sections invisible until JS/IntersectionObserver runs, which hurts crawlers, no-JS, and LCP). No ambient/scroll-driven animation anywhere on the page. Interaction feedback (hover color, focus ring, tab switch, copy state) is instant or ≤150ms opacity/color only — no layout/transform transitions, no animated tab pill, no shiki magic-move, no gradient edge fades. Only exception: the demo's own gsap ghost cursor inside ProductFrame (`gsap`/`@gsap/react` stay).
- Delete after `fallow dead-code --trace` confirms landing-only: `ClickSpark`, `SplitText`, `VariableProximity`, `Magnet`, `AnimatedContent`, `LogoLoop`, `smooth-scroll.tsx` + `lenis` dep, `robot-fab.tsx` (if unused), `features-section.tsx`, `install-chip.tsx`, `bundler-band.tsx`, and any `ui/*-icon.tsx` animated icons only they used.
- No gradients, no glass, no glow, no icon grid, no bento, no marquee, no typewriter, no bundler logo row.

## Page structure (top → bottom)

### 0. Nav (`site-nav.tsx`, restyle only)

Logo + wordmark left; "How it works", "Docs", GitHub with live star count (exists), theme toggle right. Height 56px, bottom hairline. Mobile: star count hidden.

### 1. Hero = two siblings

**HeroCopy** (`hero.tsx`): centered column `max-w-[720px]`, top padding 72px desktop / 40px mobile.

- Eyebrow (mono, red): `Beta · Open source · MIT · dev-only`
- H1 (serif italic): **"Your coding agent, inside the app it's building."** — one exported constant `HERO_HEADLINE` so the swap to "Claude Code, in the page." is one line.
- Sub (18px muted, max 52ch): "conciv connects Claude Code or Codex to your running dev app. It sees the real DOM, edits the page live, writes the change to source, and runs your tests — without you leaving the page."
- Action row: `InstallCommand` (new, replaces `install-chip.tsx`) — package-manager tabs `npm | pnpm | bun | yarn` (Radix Tabs from shadcn, `role="tablist"`, keyboard arrows) above a mono command line with a copy button (`npm i -D @conciv/it`, `pnpm add -D @conciv/it`, `bun add -d @conciv/it`, `yarn add -D @conciv/it`). SSR renders npm; the persisted choice (`localStorage` key `conciv.pm`) is read after hydration in an effect and applied — no hydration mismatch. Copy: `await navigator.clipboard.writeText`, catch failure (show "Copy failed — select the text"), success announced in an `aria-live="polite"` region ("Copied"), focus stays on the button. Beside it: secondary "Try it live" (existing `try-live-button.tsx`). Mobile (`useIsMobile`): tabs hidden and "Try it live" hidden; the command line + copy button stay.
  **ProductFrame** (`product-frame.tsx`): spans the 1180px container, 40px below the actions. The only place with browser chrome: three neutral dots (aria-hidden) and a URL field reading `localhost:3000`. Inside: the existing live demo (`demo/*`) restyled: app preview left, chat panel right (≈420px), dark theme always, aspect 16:10, `aspect-ratio` reserved before anything mounts (no CLS). Mobile: render `<img src="/screenshots/hero-demo.webp" width height alt>` (captured from the desktop demo during implementation) and never request the demo chunk or model worker. Because `useIsMobile` hydrates with a `false` server snapshot, the frame renders only the reserved aspect box until the media query is _known_ on the client (tri-state: unknown → mobile | desktop; extend `use-media-query.ts`/`use-is-mobile.ts` accordingly); the lazy `Demo` import is evaluated only in the desktop branch after that. Under the frame, one mono line: `The live demo runs a small local model in your browser. Connect your own agent with "Try it live".`

### 2. Principles strip (`principles-strip.tsx`)

Full-width rule; three equal columns (stack under `sm`); bold 15px title + 14px muted line, no icons:

- **One integration** — "Add the plugin to your Vite, Next.js, webpack, or Rspack dev build. Dev-only; nothing ships to production."
- **The real DOM** — "Point at any element. The agent gets the live node, its source location, and its state."
- **Your machine** — "Your code and prompts never pass through conciv servers. No conciv account or API key — bring your own Claude Code or Codex CLI."

### 3. Capabilities (`capability-section.tsx`, image-led, replaces `features-section.tsx`)

Eyebrow `ON THE PAGE`; h2 (serif) "The page becomes the agent's context."; no sub. Then an asymmetric figure sequence, not a catalogue:

- Row A (2 large figures, 50/50, stack under `md`): `grab-element.webp` — **Grab any element** / "Crosshair-pick a node; the agent gets the element, its source file:line, and its live state." and `edit-live.webp` — **Try it live first** / "Style and DOM edits land on the running page, ephemeral, until you ask the agent to write them to source." (consistent with the frame's own text: live-only, no source touched)
- Row B (3 small figures, 3/2/1 columns): `test-run.webp` — **Runs your tests** / "Run Vitest or Playwright locally; results render as cards in the thread."; `permission.webp` — **Asks before risky commands** / "Approve or deny shell commands from the chat. Read-only commands just run."; `whiteboard.webp` — **Draws with you** / "A shared Excalidraw canvas the agent can draw on, with source-anchored comments."
- Row C (full-width, 21:9): `any-running-app.webp` — **Any running app** / "Mounted on a local clone of vite.dev with one Vite plugin line. Nothing about the host changed."
  Each figure = `<figure>` with `<img loading="lazy" decoding="async" width height alt>` (intrinsic size set from `public/screenshots/index.json`) and `<figcaption>` (title + line). Alt text is the factual `alt` from `index.json`.

Assets: produced by the asset agent from the stills library masters into `apps/site/public/screenshots/*.webp` (large/small tiles 1160×726, wide 2360×1012, `fab-closed.webp` 800×600, `hero-demo.webp` 1440×900) with `index.json` recording `{file, source, crop, width, height, alt}` — this manifest is the reproducibility record (masters live outside the repo). Existing PNGs in `public/screenshots/` are kept if referenced anywhere in `apps/site` or `content/` (grep first); unreferenced ones are deleted (plan task 6).

### 4. How it works (`how-it-works.tsx`, rewrite as a numbered technical document)

Eyebrow `HOW IT WORKS`; h2 "From npm to the spark in three steps."; sub "No SaaS, no second terminal." Three rows: mono red numeral `01 02 03` (56px, left column, above content under `sm`), title, one line, real code:

1. **Install** — the same `InstallCommand` (shares the pm selection).
2. **Add the integration** — existing `FrameworkTabs` restyled to the figure look; tab set and labels exactly what `framework-snippets.ts` supports (`soon` entries stay visibly `soon`, iOS labelled alpha). No logo row.
3. **Open your app** — mono block `pnpm dev` and the line "The spark appears bottom-right. Click it, or press Mod+`for the quick terminal." (product default per`apps/conciv/src/data/settings.ts` `DEFAULT_HOTKEYS`; the site's own `vite.config.ts`overrides it to`Alt+k`for conciv.dev — the copy describes a fresh install, so the default is correct; re-verify before shipping) plus the small`fab-closed.webp` figure.

### 5. Open source ledger (`open-source-strip.tsx`)

Full-width rule; left: h2 (serif) "Open source, on your machine."; right: a compact mono ledger — `stars <live count>` (extract a `StarCount`/`useStarCount` export from `github-star-link.tsx`), `license MIT`, `conciv-hosted services none` — and links "Star on GitHub →", "Read the docs →". No avatars, no invented numbers.

### 6. Footer (`site-footer.tsx`, keep, restyle to rules)

## Components

New: `install-command.tsx`, `product-frame.tsx`, `principles-strip.tsx`, `capability-section.tsx`, `open-source-strip.tsx`.
Rewritten: `hero.tsx` (HeroCopy), `how-it-works.tsx`, `landing-page.tsx`, `site-nav.tsx`/`site-footer.tsx` (style).
Kept: `spark-mark.tsx`, `try-live-button.tsx`, `framework-tabs.tsx` + snippets, `copy-button.tsx` (fix: await + catch + aria-live), `demo/*`, `lazy-motion.tsx`, `theme-toggle.tsx`, live star count.
Deleted: see visual system list, each after `fallow dead-code --trace`.
Dependencies (approved by Omri): add `@fontsource-variable/newsreader`, `@fontsource-variable/jetbrains-mono`; remove `lenis`. Keep `gsap`/`@gsap/react`. Nothing else without asking.

### Component registry mapping (v4)

Every UI element is sourced from a registry (21st.dev, smoothui.dev, kokonutui.com, shadcn) and adapted to `--od-*` tokens; hand-written code is reserved for page layout containers and copy. Some cited registry IDs turned out to be a poor structural or rule fit for this design system (wrong semantic shape, or they reintroduce effects the spec explicitly bans) — those are recorded as rejected, with the concrete reason, rather than force-fit.

Adopted:

- **Framework tabs indicator** (`framework-tabs.tsx`) — smoothui `animated-tabs` (`https://smoothui.dev/r/animated-tabs.json`): brought back an interaction-triggered `layoutId` underline bar on tab switch. This is the one explicit exception to the "no animated tab pill" motion rule — allowed here only, because the indicator only ever moves in response to a click, never on mount/scroll.
- **Step 3 terminal block** (`how-it-works.tsx`) — 21st Code Block (`21st get 1099`, manuarora700): kept the filename-bar-plus-copy-button layout, dropped `react-syntax-highlighter` — a single `pnpm dev` line has nothing to highlight, and shipping a syntax highlighter client-side for zero visual benefit isn't an "obviously-necessary" dependency.
- **ProductFrame chrome bar** (`product-frame.tsx`) — 21st Safari mockup (`21st get 4117`, ruixen.ui/safari-01): adopted its centered-url-bar proportions (`px-4 py-2`, symmetric dot/url/spacer layout). Rejected its colored red/yellow/green traffic-light dots — that would add a new red surface, banned by the palette rule — kept neutral `--od-line` dots and dropped `next/image` (not our stack).
- **Capability figures** (`capability-section.tsx`) — shadcn `Card` (already installed): wraps each screenshot, stripped back to a plain 1px `--od-line` border with no ring/shadow/radius override, per the "border-and-caption figure, no chrome" tile rule.
- **Buttons**: standardized on shadcn `Button` (`ui/button.tsx`) as the one button system — it's already what every CTA/link (`TryLiveButton`, demo controls, alert dialog actions) uses; smoothui `smooth-button` was evaluated and not adopted (see rejected list) so nothing had to migrate.

Rejected (fetched, evaluated against the accepted spec/motion rules, not adopted):

- **Header** — smoothui `header-6` is a centered hero section ("Less is more" / "Explore components →"), not a nav bar; the registry ID doesn't map to what was asked for. It also uses `initial={{opacity:0}}` mount-fade, the exact SSR-invisible-content bug v3→v4 just removed via `Reveal`. Evaluated 21st "Navbar 1" (`21st get 2046`) as a fallback candidate too: floating white pill, black CTA button, `initial`/`animate` opacity-fade-in on every link — fights the flat hairline/paper palette and the no-entrance-animation rule. Kept the existing hand-tuned `site-nav.tsx` (56px, `border-b`, mono labels), restyled the vertical rhythm/gutters only.
- **Theme toggle** — kokonutui `switch-button` (`https://kokonutui.com/r/switch-button.json`): gradient background, layered box-shadows, a hover shine-sweep transform, and a 360° icon rotation on hover — five separate violations of "no gradients / no glow / interaction feedback is ≤150ms opacity or color only, no transform." Kept the existing minimal Sun/Moon icon toggle, which is already the un-gradiented, un-animated version of the same idea.
- **Install command tabs** — 21st "Script Copy Button" (`21st get 1095`, dillionverma): its package-manager switcher is three `<Button>` elements with `onClick`, not real tabs — no `role="tablist"`, no roving `Home`/`End`/arrow-key navigation, which the spec explicitly requires ("Radix Tabs … keyboard arrows"). It also ships `shiki`'s client-side `codeToHtml` to syntax-highlight a plain one-line shell command. Kept the existing `radix-ui` `Tabs`-based `install-command.tsx` (already accessible, already correct) rather than downgrade it.
- **Ledger/stats** — smoothui `stats-1` (`https://smoothui.dev/r/stats-1.json`): a 4-card stat grid with spring scale-pop-in on scroll, gradient hover glow, rounded cards — wrong shape (spec calls for a "compact mono ledger," three text rows, not stat cards) and reintroduces both the entrance-animation and gradient/glow bans. Kept the existing `open-source-strip.tsx` ledger rows.
- **Star count display** — smoothui `github-stars-animation` (`https://smoothui.dev/r/github-stars-animation.json`) and `number-flow` (`https://smoothui.dev/r/number-flow.json`): the former does its own client-side GitHub API fetch plus a stack of stargazer avatars, which duplicates the existing `useStarCount`/`star-count-store` data path and directly contradicts "No avatars, no invented numbers"; the latter is a plus/minus quantity-stepper input control (cart-style), not a passive count display — neither matches "a live star count next to a GitHub link." Kept `useStarCount`, exported for reuse (already done pre-v4).
- **Footer** — smoothui `footer-4` (`https://smoothui.dev/r/footer-4.json`): a single-row minimal footer (logo | 3 links | 3 social icons) that has no room for the spec's Product/Community/Install column structure — adopting it would delete approved required content, not adapt it. It also carries the same opacity-fade-on-mount pattern. Kept the existing 4-column footer, removed only its decorative shader iframe (done pre-v4).
- **Steps (01/02/03)** — 21st Steps (`21st get 6087`, anubra266) is `@ark-ui/react`'s `Steps` primitive: a linear progress wizard with current/complete/incomplete states, which doesn't exist as a concept on this page (all three steps are always visible, there's no step progression to track), and it would add a new dependency (`@ark-ui/react`) to represent nothing. Kept the mono red 56px numeral treatment the spec already calls for exactly.

New dependencies from this pass: **none** — every adopted component drew only on packages already in `apps/site/package.json` (`radix-ui`, `motion`, `lucide-react`, shadcn `Card`/`Button`).

## Responsive

Breakpoints `sm` 640 / `md` 768 / `lg` 1024. Hero frame edge-to-edge with 16px gutters under `md`. Row A 2/1, Row B 3/2/1. Column rules hidden under `md`.

## Accessibility

Real alt on every image; every `<img>` has intrinsic `width`/`height`. Tabs keyboard-operable; copy feedback via `aria-live`; browser chrome dots `aria-hidden`; visible focus rings; h1 contrast on paper and dark ≥ 4.5:1.

## Testing (`apps/site`; unit via `vitest.config.ts`, browser ITs via `vitest.e2e.config.ts` — note `*.it.test.ts` is excluded from the unit config)

- Existing suites keep passing. `mobile-gating.it.test.ts`: update to the new contract (tabs + Try live absent on mobile; command line + copy button present; demo chunk/model worker not requested; `hero-demo.webp` rendered) and switch it from `browser.newContext()` to `browser.newPage()` per repo rule.
- New `landing-install-command.it.test.ts`: tab switch updates the command; arrow keys move tabs; copy → clipboard has the command and the live region says "Copied"; selection persists across reload (assert the settled value, tolerate npm pre-hydration); clipboard failure path shows the failure text.
- New `landing-sections.it.test.ts`: h1 text = `HERO_HEADLINE`; capability figures count = 6 with non-empty alt and intrinsic width/height; how-it-works has three numerals; open-source ledger renders the star count element; no page errors / console errors during load.
- Web-first assertions only (`expect(locator)`), no sleeps, no CSS-detail assertions, no test ids.
- Screenshot evidence for the PR (not a test): 1440×900 and 390×844, light + dark, `prefers-reduced-motion: no-preference`, DPR 2, zero console errors — attach to the PR description. Omri also eyeballs in Firefox.

## Gates before PR

`pnpm --filter=site typecheck`; `pnpm exec turbo run test --filter=site`; `pnpm exec turbo run test:e2e --filter=site --concurrency=1`; `pnpm lint`; `pnpm format:check`; `pnpm exec fallow audit --changed-since main --format json` (nothing INTRODUCED); `21st review apps/site/src/components/landing` (apply only safe fixes, report the rest); `pnpm exec conciv-publish check-changesets --require-coverage --base origin/main` (expected outcome: `apps/site` is private, no changeset needed unless a published package changed — report the actual result).

## Out of scope / follow-ups

Light-theme widget captures; docs restyle; customers/logos section; video; Rollup/esbuild snippets (product task).
