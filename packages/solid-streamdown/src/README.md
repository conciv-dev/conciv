# solid-streamdown/src

## Overview

The `Streamdown` Solid component and its block splitter. Markdown is healed with `remend`, split into blocks, and each block is rendered through a unified (remark/rehype) processor, so only changed blocks re-render while text streams in.

## Interface

- `streamdown.tsx`: the `Streamdown` component; a `highlightCode` hook may draw a fence as HAST or as its own Solid view (`FenceView`, `FencedView`).
- `local-file-links.ts`: classifies links and inline code as local file paths (`localLinkPath`, `isInlineCodePath`, `localLinkTarget`).
- `parse-blocks.ts`: splits markdown into block strings with the `marked` lexer.
- `solid-streamdown.tsx`: the entry. `styles.css` is exported as `@conciv/solid-streamdown/styles.css`.

## Invariants

- `parse-blocks.ts:parseMarkdownIntoBlocks` - markdown with footnote references or definitions stays one block; an open HTML block absorbs following tokens until its tag closes.
- `streamdown.tsx:Streamdown` - incomplete markdown is healed with `remend` unless `parseIncompleteMarkdown === false`; empty blocks are dropped.
- `streamdown.tsx:Streamdown` - raw HTML is parsed only with `allowRawHtml` and then passed through `rehype-sanitize`; link and image prefixes default to `['*']`.
- `streamdown.tsx:Streamdown` - `highlight` adds a rehype step after `rehype-harden` that runs zag `highlightWord` (`ignoreCase`, `matchAll`, `exactMatch`, the engine behind Ark `Highlight`) over HAST text nodes outside `code` and `pre` and wraps each matched chunk in a `mark` element; it builds HAST nodes, never HTML strings.
- `streamdown.tsx:Streamdown` - with `openLocalFile`, a link whose href names a local file (a relative or absolute path, a `file:` URL on no host or `localhost`, a path with a `:42` line suffix; not a web URL, `mailto:`, `#fragment` or `?query`) is held aside before `rehype-harden` and drawn as `a[data-local-link]` with `role="link"`, `tabindex="0"` and no `href`, so the link allow-list judges only web links; a primary click or Enter on it calls `openLocalFile` with the path and prevents the default. Without `openLocalFile` links render exactly as before.
- `streamdown.tsx:Streamdown` - with `localFileExists`, each distinct inline-code text that looks like a path (outside `pre` and links) is asked once per block, never in the block still streaming (the last block while `isAnimating` is true, whatever `animated` is; it is asked once streaming ends); `true` marks the code `data-inline-code-kind="path"`, and with `openLocalFile` also `role="link"` and `tabindex="0"` so it is a tab stop (a primary click, Enter or Space opens it through `openLocalFile` and prevents the default; with `localFileExists` alone it is marked but not focusable), `false`, a rejected promise or a throw leaves it plain code, a pending promise leaves it plain until it resolves, and an answer for a path the block no longer shows is dropped.
- `streamdown.tsx:Streamdown` - a `FenceView` that calls `fallback()`, or throws while it renders (Solid `ErrorBoundary`), is replaced by its `FencedView.fallback` (a `HastElement` drawn with highlighting off, a nested `FenceView` whose own fallback is the plain fence), or, for a bare `FenceView` or an undefined `fallback`, by that fence drawn as if `highlightCode` had returned `undefined` (a throw is logged once, `console.error('[streamdown] <language> fence view failed', error)`); the fall back holds for the code it was declined for, so a code change mounts the view again. A view that renders nothing is not a decline: the caller calls `fallback()`.
- `streamdown.tsx:Streamdown` - animation runs only when `animated !== false` and `isAnimating === true`, and enter animation starts after mount.

## Side Effects

- `streamdown.tsx:Streamdown` - sets `data-local-links` on its root while `openLocalFile` is set (`styles.css` does not style local links or confirmed paths; a host styles them off `data-local-links`, `a[data-local-link]` and `code[data-inline-code-kind='path']`, as `@conciv/ui-kit-chat`'s `theme/tokens.css` does).
- `streamdown.tsx:Streamdown` - sets the `--sd-caret` CSS variable on the root while animating; renders DOM text nodes per block.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/solid-streamdown` from the repo root (turbo builds the package and its dependencies first)
