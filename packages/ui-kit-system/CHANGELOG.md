# @conciv/ui-kit-system

## 0.0.21

### Patch Changes

- [#626](https://github.com/conciv-dev/conciv/pull/626) [`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b) Thanks [@omridevk](https://github.com/omridevk)! - Delete the tests that asserted CSS or animation implementation details.

- [#646](https://github.com/conciv-dev/conciv/pull/646) [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8) Thanks [@omridevk](https://github.com/omridevk)! - Remove test-only and unused exports from the package surfaces.

- [#650](https://github.com/conciv-dev/conciv/pull/650) [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee) Thanks [@omridevk](https://github.com/omridevk)! - `Slider` and `SegmentGroup` join the kit, and status dots gain a `warn` tone.

- [#651](https://github.com/conciv-dev/conciv/pull/651) [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3) Thanks [@omridevk](https://github.com/omridevk)! - Warm tooltips: `Tooltip.Group` turns a toolbar's tooltips into one label that pops in on the first trigger, then glides and resizes to the next while the text swaps, with an optional lean and fuse. Ungrouped tooltips get the same pop. `TooltipIconButton` accepts a `shortcut` rendered as a keycap. The chat action bar, composer, terminal actions and whiteboard thread header share one warm tooltip.

  Switch: the thumb travels on a spring, squishes with its velocity, swells on hover and can be dragged; reduced motion jumps.

- [#675](https://github.com/conciv-dev/conciv/pull/675) [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1) Thanks [@omridevk](https://github.com/omridevk)! - Tool result images open in a viewer: click the thumbnail for a fit-to-window dialog, click the image for actual size. Image attachments in the composer and on sent messages open the same viewer.

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - One clipboard primitive behind every copy button. `createClipboardCopy` owns the copied/failed state, the reset window and the announcement text; `ClipboardCopyButton` is the opinionated presentation on top of it (tooltip icon button, copy-to-check swap, live region). Copy actions in the trace output block, the message action bar, the try-it connect pane, the terminal actions and the composer now share it, so a refused clipboard write is reported as a failure everywhere instead of being announced as a success. Trace output block actions moved out of the hover overlay into the block's own chrome row, so they are visible and reachable without a pointer and no longer sit on top of the output.

- [#553](https://github.com/conciv-dev/conciv/pull/553) [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2) Thanks [@omridevk](https://github.com/omridevk)! - Collapsible open/close (tool cards, chain-of-thought groups) now animates `grid-template-rows` via CSS keyframes instead of the box-model `height`. `@zag-js/collapsible` determines whether an exit animation exists by reading the content element's computed `animationName`, and waits for `animationend` before letting the state settle; a CSS `transition` on `height` never fires that event, so the earlier attempt to swap in a `transition`-based approach snapped instantly instead of animating. The content element is a CSS grid with a single `1fr`/`0fr` row track; its child wrapper carries `overflow: hidden` and `min-height: 0` so the collapsed track visually and structurally clips to zero. `prefers-reduced-motion` is honored on both variants. Measured in the live-widget rig: toggle-window p99 dropped to 9.3ms versus 16-17.5ms for the prior height-based animation; the worst-case catastrophic frames were independent of which toggle animation was in flight.

  `usePauseFollowOnToggle` previously waited on `animationend` for every toggle, including under `prefers-reduced-motion`, where `motion-reduce:animate-none` means no animation ever starts and no `animationend` ever fires. Thread auto-follow stayed paused for the full 1000ms ceiling on every toggle for reduced-motion readers. The hook now checks the toggled element's computed `animationName` synchronously after the toggle: when it is `none` (no animation running), follow releases immediately instead of waiting on an event that will never arrive.

- [#570](https://github.com/conciv-dev/conciv/pull/570) [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1) Thanks [@omridevk](https://github.com/omridevk)! - The widget now adapts to the host page's color scheme instead of always rendering dark. It resolves
  the scheme at mount, before first paint, from a computed `color-scheme` on the host root, then a
  `.light`/`.dark` class or `data-theme` attribute, then `prefers-color-scheme`, and re-resolves live
  when the host page toggles its theme. Every color token is declared once as a `light-dark()` pair,
  so a scheme is a single `color-scheme` flip: scrollbars, native controls, Shiki code blocks, the
  diffs component, popped-out windows, and the terminal pane all follow. UnoCSS `dark:`/`light:`
  variants key off the widget's own scheme classes. Extension `chat-accent` / `chat-hue` overrides keep
  working in both schemes.

- [#593](https://github.com/conciv-dev/conciv/pull/593) [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3) Thanks [@omridevk](https://github.com/omridevk)! - Skin axis: named looks over a 37-anchor token contract, selected with `--conciv-skin`.

  A host page picks the widget's look by declaring one CSS custom property on `html` or `body`:

  ```css
  html {
    --conciv-skin: terminal;
  }
  ```

  Two skins ship in-repo: `conciv` (the default) and `terminal`. Each is a typed object in
  `@conciv/ui-kit-system` that sets only the anchors — surfaces, ink, overlays, accent, status, type,
  radii, shadows, easing and a density unit — as `{light, dark}` pairs or single values, so a skin is
  complete for both colour schemes by construction and omitting anything is a compile error. Every
  other `--chat-*` custom property stays internal and is derived once from the anchors, so hand-tuned
  semantics stay consistent across skins.

  The resolved skin is stamped on every render root the widget owns, including the shadow host (so
  Ark portals follow), the body-level effects overlay and popped-out windows, which now carry both the
  scheme and the skin. An unknown value falls back to `conciv` with one console warning. The skin's
  `--chat-space` scales the spacing base of the thread and composer only; frame geometry does not
  follow it.

  Two contract documents are generated from the same typed source and committed, with a CI drift
  check: `docs/skin-anchors.md` (what a skin may write) and `docs/extension-tokens.md` (what an
  extension may read). Every skin's colour pairs are checked for WCAG contrast in CI.

  BREAKING: the per-extension theme map is removed. `defineExtension({theme})`, the `ThemeTokens` type,
  the runtime theme applier and its injected `style[data-conciv-theme]` element, the catalog's theme
  validation and `overridable` token flag, and the `theme` scaffold kind are all gone. Extensions style
  exclusively through the public `--chat-*` tokens and utilities; derive a bespoke colour locally with
  `color-mix` over a public token instead.

- [#569](https://github.com/conciv-dev/conciv/pull/569) [`478c83b`](https://github.com/conciv-dev/conciv/commit/478c83bdee4d5d7c5e7a27c3586d030907ccf80c) Thanks [@omridevk](https://github.com/omridevk)! - Merge the `--pw-*` design-token namespace into `--chat-*`, leaving one custom-property family. CSS
  custom properties, the ui-kit-system token module and its generated sheet, UnoCSS color/radius/font/
  easing keys, shadow shortcuts, keyframe names and the xterm computed-style reads all move to the
  `chat` prefix. The 25 colliding chrome/thread roles are unified or expressed as derived variants
  rather than sibling literals.

  Breaking for extension authors: theme override keys are renamed, `theme: {'pw-accent': …}` becomes
  `theme: {'chat-accent': …}`.

  Also removes the unused `chat-hue` theme key (no code ever read `var(--chat-hue)`): breaking for any
  extension setting `theme: {'chat-hue': …}` or `'pw-hue': …`, which is now a no-op.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Clipped text now reveals its full content in a tooltip. A new `TruncatedText` primitive measures its own
  box when the tooltip is asked to open, so only text that is actually cut off grows a reveal; text that
  fits stays quiet. Adopted across the trace rows, tool card headlines, value chips, page-session steps,
  the panel title, the status bar view labels, and the session selector, whose bar variant also no longer
  lets a long session title escape the popover.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Render tool-result JSON through a virtualized tree so opening a large branch paints in one frame instead of mounting every row up front.

## 0.0.19

### Patch Changes

- [#461](https://github.com/conciv-dev/conciv/pull/461) [`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017) Thanks [@omridevk](https://github.com/omridevk)! - New `Loader` compound (`Loader.Root/Indicator/Text/Label/Description`) built on Ark's indeterminate Progress: a conic-gradient orb whose arcs animate registered `@property` angles rather than rotating a rasterized texture, drawn entirely in `currentColor` so it inherits any surface. Sizes ride a `--pw-loader-size` variable through `data-size`, and `Loader.Indicator` renders whatever children it is given, so a different visual replaces one part instead of the component. Styled entirely through the shared `@conciv/uno-preset` (keyframes, a `data-size` rule and shortcuts), like every other component in the package — no separate stylesheet to `@import`.

## 0.0.18

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

## 0.0.10

## 0.0.9

## 0.0.8

## 0.0.7

## 0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

## 0.0.4

## 0.0.3

## 0.0.2

## 0.0.1
