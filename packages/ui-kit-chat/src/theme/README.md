# theme

## Overview

Theme assets: the thread-side `--chat-*` CSS custom properties, the Shiki CSS-variables code theme and inlined chat fonts.

## Interface

- `tokens.css` - `:root, :host` custom properties such as `--chat-bg`, `--chat-trace-gutter` and `--shiki-*` light-dark pairs; published as `./theme/tokens.css`.
- `code-theme.ts:codeTheme`, `code-theme.ts:CODE_THEME_NAME` (`conciv-code`), `code-theme.ts:concivCodeTheme`; published as `./theme/code-theme`.
- `code-theme-tokens.ts:concivCodeTheme` - `createCssVariablesTheme` with prefix `--shiki-`.
- `fonts.ts:CHAT_FONTS` - JetBrains Mono, Archivo and Source Sans 3 faces as inline woff2 data; type `ChatFontFace`; published as `./theme/fonts`.

## Invariants

- Each color token that differs between schemes is one `light-dark()` pair in `tokens.css`; the system half of the `--chat-*` namespace lives in `@conciv/ui-kit-system` tokens.
- `code-theme.ts:codeTheme` registers the theme at most once (`registration.done`).
- `tokens.css` styles inline code in `.prose-chat` with a transparent background and `--chat-code`; a file path the host confirmed (`code[data-inline-code-kind='path']`, set by `@conciv/solid-streamdown`) takes `light-dark(var(--chat-accent), var(--chat-mono-lift))` instead.

## Side Effects

- `code-theme.ts:codeTheme` calls `registerCustomTheme` from `@conciv/solid-diffs` on first use.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
