# Animation improvement plans

Written by the `improve-animations` audit at commit `7fb70e7b` (2026-07-12). Each plan is self-contained: an executor needs no context beyond the plan file. Standards source: Emil Kowalski's animation philosophy (AUDIT.md / STANDARDS.md in the skill).

## Plans

| #   | Plan                                                                                           | Severity | Area                              | Status |
| --- | ---------------------------------------------------------------------------------------------- | -------- | --------------------------------- | ------ |
| 001 | [Replace wind4 built-in entrance keyframes](001-entrance-keyframes-replace-wind4.md)           | HIGH     | uno-preset (all widget entrances) | TODO   |
| 002 | [Fix broken `anim-spin` class](002-fix-broken-anim-spin-class.md)                              | HIGH     | ui-kit-chat-tools                 | TODO   |
| 003 | [Wire panel & quick-terminal open/close](003-panel-quick-terminal-open-close.md)               | HIGH     | apps/conciv                       | TODO   |
| 004 | [Restore hydration suppression + tab-slide reset](004-session-switch-hydration-suppression.md) | HIGH     | apps/conciv + ui-kit-chat         | TODO   |
| 005 | [Highlight glide: token + transform](005-highlight-glide-transform.md)                         | HIGH     | apps/conciv                       | TODO   |
| 006 | [Mascot work→open tween + reduced-motion pose](006-mascot-work-open-transition.md)             | MEDIUM   | mascot                            | TODO   |
| 007 | [Toast transitions](007-toast-transitions.md)                                                  | MEDIUM   | ui-kit-system                     | TODO   |
| 008 | [page-mirror hygiene](008-page-mirror-hygiene.md)                                              | MEDIUM   | page (host-page overlays)         | TODO   |
| 009 | [FAB drag snap via transform](009-fab-drag-snap-transform.md)                                  | MEDIUM   | apps/conciv                       | TODO   |
| 010 | [ui-kit-system polish (press/popover/dialog/swap)](010-ui-kit-system-polish.md)                | MEDIUM   | ui-kit-system                     | TODO   |
| 011 | [Chat surface motion (action bar, notices, chips)](011-chat-surface-motion.md)                 | MEDIUM   | ui-kit-chat + apps/conciv         | TODO   |
| 012 | [Chat package-level reduced motion](012-chat-package-reduced-motion.md)                        | MEDIUM   | ui-kit-chat + uno-preset          | TODO   |
| 013 | [Extensions pass (whiteboard/terminal/test-runner)](013-extensions-motion-pass.md)             | MEDIUM   | extensions                        | TODO   |
| 014 | [Site performance (idle loops, layout reads)](014-site-performance.md)                         | HIGH     | apps/site                         | TODO   |
| 015 | [Site reduced-motion + hover gates + dead CSS](015-site-reduced-motion.md)                     | HIGH     | apps/site                         | TODO   |
| 016 | [Site cohesion (tokens, stagger, frequency trims)](016-site-motion-cohesion.md)                | MEDIUM   | apps/site                         | TODO   |
| 017 | [Widget cohesion cleanup (LOW sweep)](017-widget-cohesion-cleanup.md)                          | LOW      | widget packages                   | TODO   |

## Recommended execution order & dependencies

Widget track (one PR each, or batch 1+2 together):

1. **001** — root keyframe fix; changes how every widget entrance feels. Do first.
2. **002** — one-line broken-class fix; independent, trivially safe.
3. **010** — depends on 001 (`anim-pop` builds on `pw-fade-in-up`).
4. **004** — independent of 001 but verify feel after both (entrances now subtle AND suppressed on bulk mounts).
5. **003** — panel choreography; independent; largest feel change.
6. **011** → **012** — 012's shortcut gating covers classes 011 adds/removes; do 011 first.
7. **005, 006, 007, 008, 009** — independent of each other and of the above; any order.
8. **013** — after 001 (uses `anim-presence-in` semantics unchanged, but feel-check assumes new keyframes).
9. **017** — last in the widget track (sweep; avoids conflicts with earlier edits in the same files).

Site track (independent of the widget track entirely):

1. **014** — perf first (Magnet refactor lands the structure 015's gate hooks into).
2. **015** — reduced-motion/hover gates (Magnet gate coordinates with 014).
3. **016** — cohesion/tokens last (touches the same files; rebases cleanest at the end).

## Known-and-accepted (not planned)

- Ark collapsible height keyframes (`anim-collapse-*`): Zag constraint, deliberate.
- Widget blanket reduced-motion reset (`apps/conciv/src/styles.css:125`): documented tradeoff; plans 012/015 add component-level gates where the blanket doesn't reach.
- `--chat-ease` duplicating `--pw-ease`: package independence by design.
- Activity-rail width snap (`mirror-rail.tsx:158`): animating width thrashes xterm fit; revisit with a fit-on-transitionend spike.
- Excalidraw canvas visibility flip (`island.tsx:329`): light-DOM/hit-test risk; needs its own investigation.
- Example apps (`apps/examples/*`): boilerplate `transition: all` and missing reduced-motion — demo-grade, accepted.

## Verifying a completed plan

Each plan has Mechanical + Feel check sections. Global gates before any PR: `pnpm typecheck && pnpm build && pnpm test`, `pnpm exec fallow audit --changed-since main --format json` (fix INTRODUCED findings), and the plan's own feel checks in a real browser.
