# @conciv/uno-preset

## 0.0.23

### Patch Changes

- [#1022](https://github.com/conciv-dev/conciv/pull/1022) [`35347d2`](https://github.com/conciv-dev/conciv/commit/35347d2abd0aeb696eaa04e8df49ca7bc1d44fa9) Thanks [@omridevk](https://github.com/omridevk)! - Code in tool cards sits on the same sunken surface as the JSON and console bodies. The preset gains a `rounded-chat-sm` radius token for the small chat corner.

  A file's name is now the header of its code block, set apart from the code by a line. Every code and diff block has a copy button, in the header when the block names a file and at the top right otherwise, and a block cut short by its height limit shows how many lines are hidden and opens to show them all.

  A bash call shows one box: its command is the header row, with copy and the expand control on that same line, and the output below. A long block shows exactly eleven lines (seventeen for logs and files) and its expand control names the true number of hidden lines; the trace row no longer clamps a code block a second time. Search matches, code-run output and a finished code fence in a chat message use the same header. Every icon in a kit button is a block box, so it centres with its label at any line height.

- [#1047](https://github.com/conciv-dev/conciv/pull/1047) [`a8c4a20`](https://github.com/conciv-dev/conciv/commit/a8c4a20b789d17ee618c049b99d03edcd1388313) Thanks [@omridevk](https://github.com/omridevk)! - The same source now builds the same widget CSS and the same file names every time. Before, the theme variables in the widget's CSS came out in a different order from one build to the next, which changed every file name and broke installs that checked the package's checksum.

## 0.0.22

### Patch Changes

- [#782](https://github.com/conciv-dev/conciv/pull/782) [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3) Thanks [@omridevk](https://github.com/omridevk)! - Search matches in the session picker and preview use the shared `chat-accent-20` tint with `chat-text` ink, so matched words read at WCAG AA on every row; the one-off `--chat-highlight` token is gone.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - A session search hit now shows a short excerpt from the line that matched, with the matched words highlighted in the excerpt and the title, so you can tell why a session was found before opening it.

## 0.0.21

No changes in this release.

## 0.0.20

### Patch Changes

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

## 0.0.19

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
