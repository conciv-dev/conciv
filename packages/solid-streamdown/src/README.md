# solid-streamdown/src

## Overview

The `Streamdown` Solid component and its block splitter. Markdown is healed with `remend`, split into blocks, and each block is rendered through a unified (remark/rehype) processor, so only changed blocks re-render while text streams in.

## Interface

- `streamdown.tsx:Streamdown` - props `children`, `animated`, `isAnimating`, `caret` (`'block' | 'circle' | boolean`), `parseIncompleteMarkdown`, `remendOptions`, `allowRawHtml`, `allowedLinkPrefixes`, `allowedImagePrefixes`, `highlightCode`, `class`.
- `streamdown.tsx:StreamdownProps` / `HighlightCode` / `HastElement` / `FenceView` - exported types; `HighlightCode` returns a `HastElement`, a `FenceView` or `undefined`.
- `parse-blocks.ts:parseMarkdownIntoBlocks(markdown)` - splits markdown into block strings with the `marked` lexer.
- `index.tsx` - re-exports the above.
- `streamdown.stories.tsx` - Storybook stories.
- `styles.css` - exported as `@conciv/solid-streamdown/styles.css`.

## Invariants

- `parse-blocks.ts:parseMarkdownIntoBlocks` - markdown with footnote references or definitions stays one block; an open HTML block absorbs following tokens until its tag closes.
- `streamdown.tsx:Streamdown` - incomplete markdown is healed with `remend` unless `parseIncompleteMarkdown === false`; empty blocks are dropped.
- `streamdown.tsx:Streamdown` - raw HTML is parsed only with `allowRawHtml` and then passed through `rehype-sanitize`; link and image prefixes default to `['*']`.
- `streamdown.tsx:Streamdown` - animation runs only when `animated !== false` and `isAnimating === true`, and enter animation starts after mount.

## Side Effects

- `streamdown.tsx:Streamdown` - sets the `--sd-caret` CSS variable on the root while animating; renders DOM text nodes per block.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/solid-streamdown` from the repo root (turbo builds the package and its dependencies first)
