# @conciv/solid-streamdown

## 0.0.25

### Patch Changes

- [#1217](https://github.com/conciv-dev/conciv/pull/1217) [`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41) Thanks [@omridevk](https://github.com/omridevk)! - Every library builds with tsdown, as devframe builds its packages; Vite builds only the app bundles (the widget, the
  shell and the plugins' `./plugin-experimental` bundles). A library's `dependencies` and `peerDependencies` stay
  external, so some kits now import packages they used to bundle. `@conciv/unplugin` depends on `@conciv/protocol`.

- [#1210](https://github.com/conciv-dev/conciv/pull/1210) [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243) Thanks [@omridevk](https://github.com/omridevk)! - Every error conciv makes now comes from an evlog error catalog, with a stable code, a plain message and, where
  someone can act on it, a why and a fix. The core catalogs live in one new package, @conciv/errors, so packages
  compare codes without importing each other; each plugin keeps its own catalog, and the app provides @conciv/errors
  to plugins. Plugin.define accepts any Error, so a plugin fails its entry with its own catalog error; a plugin that
  fails to load reports its code, message and fix. Error screens, the run error row, toasts and plugin load errors show
  the fix when the error carries one, and the conciv-try CLI prints a failure as its code and message, then its why and
  fix only when they are set.

  Codes that reach agents and the widget change with it: an outside run without a tab answers `ai.NO_TAB` (was
  `NO_TAB`), a send to a deleted session fails with `session.DELETED` (was `session_deleted`), a code-mode tool error
  reaches the agent as `<code>: message` with its full catalog code, and the widget shows the engine's fix for an rpc
  error. The protocol's `ValueTooLargeError` is gone: an oversized instruction entry fails with
  `instructions.VALUE_TOO_LARGE`.

- [#1212](https://github.com/conciv-dev/conciv/pull/1212) [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d) Thanks [@omridevk](https://github.com/omridevk)! - Every package builds with Vite: one shared library build in `@internal/vite-config` (Vite environments, `rolldown-plugin-dts` for the declarations). tsdown and the separate `tsc` declaration step are gone. Libraries with several entries ship one file per module, so no declaration chunk sits outside `exports`. `experimental()` configures only the `client` environment.

## 0.0.24

No changes in this release.

## 0.0.23

### Patch Changes

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A file path in a chat message that the host confirmed exists now shows in opencode's code-path blue (`#2c47c8` in light mode, `#c3d4fd` in dark mode, the new `--chat-code-path` token), fading into it once the check answers (no fade under reduced motion). When the host can open files, the path shows a pointer and underlines on hover with opencode's underline (the path's blue at 40%, offset 2px) and shows the kit's accent focus ring on keyboard focus, and a local file link shows a pointer. `@conciv/solid-streamdown`'s `styles.css` no longer styles local links or confirmed paths; the chat theme does.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A fence view gets a `fallback()`: calling it, or throwing while it renders, shows that fence as plain code until the fence's code changes.

  A `highlightCode` result can be a `FencedView` (`{view, fallback}`), so a fence whose view falls back shows the highlighted code or another view in its place.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Inline code holding a control character is no longer offered as a file link.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - `Streamdown` takes two optional props for links to local files. `openLocalFile(path)` turns a markdown link to a file on disk (`[app](src/app.ts:42)`, `./notes.md`, `file:///tmp/a.txt`) into a link that calls it with the path, here `src/app.ts#L42`, instead of a blocked link. `localFileExists(path)` is asked about inline code that looks like a path, such as `` `src/app.ts` ``; when it answers yes, a click on that code opens the file too. Without either prop, markdown renders exactly as before.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - An inline-code path the host confirmed through `localFileExists` is now a tab stop with link semantics when `openLocalFile` is set: Tab reaches it, and Enter or Space opens it through `openLocalFile` exactly as a click does. With `localFileExists` alone the path is marked as before and is not focusable.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - `localFileExists` is no longer asked about the inline-code paths of the block still streaming when `animated` is `false`: the last block counts as streaming while `isAnimating` is true, whatever `animated` is, and its paths are asked once streaming ends.

## 0.0.22

### Patch Changes

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - The session picker previews the highlighted session beside the list: a read-only thread of its transcript, newest messages first with earlier pages loading on scroll, the search words marked, `Alt+ArrowRight` to read it and `Alt+ArrowLeft` back to the search, Escape closing the preview before the picker. Core serves it through the read-only `sessions.preview` procedure. Search marks now come from Ark `Highlight` and zag `highlightWord`, and keyboard hints share one ui-kit-system `Kbd`. `Thread.Messages` takes `readOnly`, which leaves the assistant action bar with Copy only; the preview sets it. With All projects on, another project's hit previews too: `sessions.preview` takes that hit's `cwd`, and the preview header copies its resume command through the same `createResumeCopy` as the row, so both show Copied together. `ClipboardCopyButton` can reflect a shared `ClipboardCopy` instead of its own. Previewing a session from a folder the search index does not cover yet adds that folder to the index in the background. The preview opens after 600 ms, closes when its session leaves the results, and its header copy button keeps its own Copied state with a 44px hit area. Typing in the search closes the preview. `TooltipIconButton` takes `keepOpenOnClick`, and `ClipboardCopyButton` uses it so its Copied tooltip stays visible after the click.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - A session search hit now shows a short excerpt from the line that matched, with the matched words highlighted in the excerpt and the title, so you can tell why a session was found before opening it.

## 0.0.21

### Patch Changes

- [#626](https://github.com/conciv-dev/conciv/pull/626) [`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b) Thanks [@omridevk](https://github.com/omridevk)! - Delete the tests that asserted CSS or animation implementation details.

- [#637](https://github.com/conciv-dev/conciv/pull/637) [`96acad4`](https://github.com/conciv-dev/conciv/commit/96acad42d70fcb83a2ab535999a1c97ecb34a21f) Thanks [@omridevk](https://github.com/omridevk)! - Test-only: fold each package's tests into one file and drop the empty node vitest project.

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Code blocks in chat replies no longer flip between plain and colored text while a reply streams in: lines that are already colored stay colored and only the newly arrived code is added. Selecting text inside a code block now survives the reply re-rendering around it, so you can copy from a block while the agent is still writing.

- [#546](https://github.com/conciv-dev/conciv/pull/546) [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51) Thanks [@omridevk](https://github.com/omridevk)! - Stop streamed text from flickering. Each markdown block is now a keyed node tree held in a store and reconciled by key, so words that have already settled keep their DOM node and never replay their fade; only newly mounted words animate in. The old character-counting animate plugin, its stagger variables, and the `createImmutable` hast wrapper are gone. The streaming answer also drops `text-wrap: pretty`, which re-balanced line breaks as text grew and moved settled words between lines; settled answers keep it.

- [#546](https://github.com/conciv-dev/conciv/pull/546) [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51) Thanks [@omridevk](https://github.com/omridevk)! - Fix a crash (`TypeError: Reflect.ownKeys called on non-object`) that could occur mid-stream when markdown structure changes character by character (an unclosed `**bold**`/link/inline-code marker completing, or paragraphs splitting/merging). The hast tree built for each block is now normalized to a uniform node shape (`children`/`properties` always present, even on text nodes) before being handed to `createImmutable`, so a position that changes from a text node to an element (or back) between parses never hands the reactive wrapper's internal traps a value it can't call `Reflect.ownKeys` on. Node identity and style stability are unchanged.

- [#546](https://github.com/conciv-dev/conciv/pull/546) [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51) Thanks [@omridevk](https://github.com/omridevk)! - Fix a residual DOM-churn source left after the hast-identity fix: the animate plugin recomputed each word's `skipAnimation`/`delay` from `prevContentLength` on every parse, so a word transitioned from its animating style to its settled style with one attribute write per word (42k+ style writes in one measured streaming turn). The plugin now resolves each word's animation decision once, keyed by its position, and reuses it on every later parse, so already-rendered spans are never rewritten. New words still fade in and stagger exactly as before.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - A reply that stops streaming without a final text change settles to plain text nodes instead of keeping its per-word spans.

## 0.0.19

## 0.0.18

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

### Patch Changes

- [#74](https://github.com/conciv-dev/conciv/pull/74) [`5f76cc2`](https://github.com/conciv-dev/conciv/commit/5f76cc2d14ae93265f8c72b3eb6d5254abe3bb59) Thanks [@omridevk](https://github.com/omridevk)! - Import rehype-raw and rehype-sanitize statically, matching upstream streamdown. Raw HTML support no longer loads a separate async chunk when `allowRawHtml` is enabled.

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
