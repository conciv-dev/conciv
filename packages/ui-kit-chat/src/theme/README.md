# ui-kit-chat/src/theme

## Overview

Theme assets: the thread-side `--chat-*` CSS custom properties, the Shiki CSS-variables code theme and inlined chat fonts.

## Interface

- `tokens.css`: the `:root, :host` `--chat-*` custom properties and `--shiki-*` light-dark pairs; published as `./theme/tokens.css`.
- `code-theme.ts`, `code-theme-tokens.ts`: the Shiki CSS-variables code theme (`conciv-code`); published as `./theme/code-theme`.
- `fonts.ts`: JetBrains Mono, Archivo and Source Sans 3 faces as inline woff2 data; published as `./theme/fonts`.

## Invariants

- Each color token that differs between schemes is one `light-dark()` pair in `tokens.css`; the system half of the `--chat-*` namespace lives in `@conciv/ui-kit-system` tokens.
- `code-theme.ts:codeTheme` registers the theme at most once (`registration.done`).
- `tokens.css` styles inline code in `.prose-chat` with a transparent background and `--chat-code`; a file path the host confirmed (`code[data-inline-code-kind='path']`, set by `@conciv/solid-streamdown`) takes `--chat-code-path` (`light-dark(#2c47c8, #c3d4fd)`, opencode's code-path blue) instead, fading into it over `--chat-duration-fast` with `--chat-ease` (no transition under `prefers-reduced-motion: reduce`). When the Streamdown root carries `data-local-links` (the host passed `openLocalFile`), the confirmed path outside a link and `a[data-local-link]` take `cursor: pointer`, and the path underlines on hover (opencode's hover: the line in `--chat-code-path` at 40% over transparent via `color-mix(in oklch, ...)`, offset `2px`); on `:focus-visible` that path shows the kit's focus ring (`outline: var(--chat-focus)`, `outline-offset: 0.125rem`, the values of the uno-preset `focus-ring` shortcut).

## Side Effects

- `code-theme.ts:codeTheme` calls `registerCustomTheme` from `@conciv/solid-diffs` on first use.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
