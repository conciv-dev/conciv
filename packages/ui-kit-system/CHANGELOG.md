# @conciv/ui-kit-system

## 0.0.23

### Patch Changes

- [#827](https://github.com/conciv-dev/conciv/pull/827) [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00) Thanks [@omridevk](https://github.com/omridevk)! - A long chat session no longer leaks memory through truncated text and icon button tooltips: the shared tooltip group kept one reactive slot for every row that ever mounted, so a tab driven by an outside agent grew by about 50 slots per page call. The chat panel's focus trap now lets go while focus sits on the host page, so Tab on the host page moves through the host page instead of jumping into the panel, and the trap no longer rescans the panel on every chat update while an agent drives the page.

## 0.0.22

### Patch Changes

- [#752](https://github.com/conciv-dev/conciv/pull/752) [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e) Thanks [@omridevk](https://github.com/omridevk)! - The chat column reads every type size, line height, letter spacing, mark size and transition duration from tokens instead of hand-picked values: a chat type scale (`text-chat-micro` through `text-chat-body`), `--chat-mark` sizes derived from the trace gutter, and duration tokens (`--chat-duration-fast`, `-normal`, `-slow`) behind the preset's transition shortcuts. A reply that is still running no longer leaves an empty strip for its action bar above "Responding…"; the bar's row appears once when the run ends.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - A copy button learns its first hover, focus or press from the button's own events, so its icon swap still mounts on first engagement without a hand-kept flag.

- [#718](https://github.com/conciv-dev/conciv/pull/718) [`f0daa1a`](https://github.com/conciv-dev/conciv/commit/f0daa1a089aa580314962870470eda2a01c396e4) Thanks [@omridevk](https://github.com/omridevk)! - Dialogs portal into the widget's shadow root, so a dialog opened from a chat row (such as the screen recording player) covers the panel instead of being clipped to the row.

- [#757](https://github.com/conciv-dev/conciv/pull/757) [`123466d`](https://github.com/conciv-dev/conciv/commit/123466d3313ba51a75b8828950c2c96045238abf) Thanks [@omridevk](https://github.com/omridevk)! - Clicking the panel header title, or pressing Enter or Space on it, opens the session menu: the session switcher, context usage and the refresh, pop-out and disconnect rows. Escape or an outside click closes it and returns focus to the title. A pencil next to the title renames the session in place (Enter or blur saves, Escape cancels). The separate options button and the rename control inside the session list are gone. `@conciv/ui-kit-system` gains an `Editable` wrapper over Ark UI Editable.

  Tooltips no longer replay their pop-in animation when the pointer leaves the trigger, so a closing tooltip fades away instead of flickering.

- [#797](https://github.com/conciv-dev/conciv/pull/797) [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e) Thanks [@omridevk](https://github.com/omridevk)! - Inputs size from padding and one line height instead of a fixed minimum, so text, number, password, combobox, hex and select controls line up at the same height.

- [#790](https://github.com/conciv-dev/conciv/pull/790) [`b96e75c`](https://github.com/conciv-dev/conciv/commit/b96e75cb63d8fab22327016f70976629ef549763) Thanks [@omridevk](https://github.com/omridevk)! - Session picker search rows are as tall as their excerpt, so a short excerpt leaves no empty gap under it.

- [#799](https://github.com/conciv-dev/conciv/pull/799) [`6d53b93`](https://github.com/conciv-dev/conciv/commit/6d53b9329faa79d6a9f7f9fec93d0241f07e9c50) Thanks [@omridevk](https://github.com/omridevk)! - Session picker rows stay mounted when the session list refetches the same sessions, so a hovered title keeps its tooltip and a row's "Copied" feedback survives a search refresh. Row titles share one tooltip for the whole list instead of one tooltip per row.

- [#744](https://github.com/conciv-dev/conciv/pull/744) [`57aa7f3`](https://github.com/conciv-dev/conciv/commit/57aa7f37cbb18fe3be0a2b6dc341fd612bdbd62c) Thanks [@omridevk](https://github.com/omridevk)! - Pin lucide-solid to 1.66.x, because lucide-solid 1.70.0 ships icons that Next.js cannot resolve.

- [#782](https://github.com/conciv-dev/conciv/pull/782) [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3) Thanks [@omridevk](https://github.com/omridevk)! - Search matches in the session picker and preview use the shared `chat-accent-20` tint with `chat-text` ink, so matched words read at WCAG AA on every row; the one-off `--chat-highlight` token is gone.

- [#746](https://github.com/conciv-dev/conciv/pull/746) [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2) Thanks [@omridevk](https://github.com/omridevk)! - The session list is paged with a cursor and searchable on the server.

  - `sessions.list` takes `{cursor, limit}` and returns `{sessions, next}`. Each harness reads only the transcripts on the requested page instead of its newest 50. `sessions.get` returns one session.
  - `sessions.search` searches session titles and message text across every harness that has transcript history. The index is an in-memory Orama index held in a worker thread, built in the background after the first list. Nothing is written to disk. `sessions.changes` streams the index version: the current one on subscribe, then each new one; the picker keys its list and search queries on it, so they refetch when indexing lands.
  - Claude sessions are listed through the Claude Agent SDK and follow `CLAUDE_CONFIG_DIR`. Empty and continued sessions are hidden, as in `/resume`. Codex, OpenCode and Pi answer `meta` for a single session. Transcripts are read as streams.
  - Sessions show their transcript size instead of a message count.
  - The session picker is a virtual list that loads more as you scroll and searches as you type. The search input takes pointer clicks and keeps focus while results arrive, and Today and Yesterday split at local midnight.
  - A session whose native transcript is gone no longer appears in the list.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - The session picker previews the highlighted session beside the list: a read-only thread of its transcript, newest messages first with earlier pages loading on scroll, the search words marked, `Alt+ArrowRight` to read it and `Alt+ArrowLeft` back to the search, Escape closing the preview before the picker. Core serves it through the read-only `sessions.preview` procedure. Search marks now come from Ark `Highlight` and zag `highlightWord`, and keyboard hints share one ui-kit-system `Kbd`. `Thread.Messages` takes `readOnly`, which leaves the assistant action bar with Copy only; the preview sets it. With All projects on, another project's hit previews too: `sessions.preview` takes that hit's `cwd`, and the preview header copies its resume command through the same `createResumeCopy` as the row, so both show Copied together. `ClipboardCopyButton` can reflect a shared `ClipboardCopy` instead of its own. Previewing a session from a folder the search index does not cover yet adds that folder to the index in the background. The preview opens after 600 ms, closes when its session leaves the results, and its header copy button keeps its own Copied state with a 44px hit area. Typing in the search closes the preview. `TooltipIconButton` takes `keepOpenOnClick`, and `ClipboardCopyButton` uses it so its Copied tooltip stays visible after the click.

- [#778](https://github.com/conciv-dev/conciv/pull/778) [`8a67d39`](https://github.com/conciv-dev/conciv/commit/8a67d39d925d61aaf881a878bdd3c4dfea0193c4) Thanks [@omridevk](https://github.com/omridevk)! - New generic form controls on Ark UI: a field wrapper (`FieldShell`, on Ark Field and Fieldset, with label, description, error, row or stack layout, disabled, read-only and required), `NumberInput`, `TagsInput`, `ColorPicker`, `PasswordInput`, `Checkbox` and `CheckboxGroup`, `RadioCards`, `ComboboxSelect`, `HotkeyRecorder` and `ConfirmDialog`. `TextField` gains invalid styling, start and end addons and an end action slot; `Select` gains invalid and read-only styling. Every control takes plain props and reads disabled, read-only and invalid from an enclosing Ark field.

- [#780](https://github.com/conciv-dev/conciv/pull/780) [`b2dfd2b`](https://github.com/conciv-dev/conciv/commit/b2dfd2b279d7ad6bab81c3c99d3c24874de5c257) Thanks [@omridevk](https://github.com/omridevk)! - The panel has a settings page: a gear in the session header opens it, a Back to chat button leaves it, and it reopens on the tab you used last. Each tab (General, Views, Shortcuts, Advanced) is its own route, so Back, reload and links land on the same tab. A narrow panel shows the tabs on top; a wider panel shows them as a left rail, and they glide between the two as the panel resizes. General sets color mode, skin, launcher, open on page load and close on outside click; Views shows, hides, pins and reorders (drag or Alt + arrow keys) the views in the tab bar; Shortcuts records new keys for each command and asks before taking keys another command uses; Advanced resets one part or everything. Settings are kept per project; values the project sets in `conciv({...})` show locked with the reason. The kit exports `FieldPrimitive`, `CheckboxPrimitive` and `RadioGroupPrimitive` for building custom controls on Ark.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - Streamed tool runs do less work per chunk: a chunk re-runs only the trace row whose part changed (rows keyed by tool-call id, shared group tree, result pairing that only changes when a result arrives), turns are grouped once per chat, trace clamps measure from their resize observer instead of forcing a layout, tooltips mount their content only while open, and every truncated label in the thread shares one tooltip.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - Tool rows and their result bodies build a fraction of the reactive work they used to. A copy button inside the thread shares the thread's one tooltip and builds its icon swap on first hover or focus, and the row, card and output layers derive each value once.

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
