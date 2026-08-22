---
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-chat': patch
'@conciv/uno-preset': patch
'@conciv/extension': patch
'@conciv/extension-terminal': patch
'@conciv/embed': patch
---

The widget now adapts to the host page's color scheme instead of always rendering dark. It resolves
the scheme at mount, before first paint, from a computed `color-scheme` on the host root, then a
`.light`/`.dark` class or `data-theme` attribute, then `prefers-color-scheme`, and re-resolves live
when the host page toggles its theme. Every color token is declared once as a `light-dark()` pair,
so a scheme is a single `color-scheme` flip: scrollbars, native controls, Shiki code blocks, the
diffs component, popped-out windows, and the terminal pane all follow. UnoCSS `dark:`/`light:`
variants key off the widget's own scheme classes. Extension `chat-accent` / `chat-hue` overrides keep
working in both schemes.
