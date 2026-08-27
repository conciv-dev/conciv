---
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-chat': patch
'@conciv/extension': patch
'@conciv/tools': patch
'@conciv/embed': patch
---

Skin axis: named looks over a 37-anchor token contract, selected with `--conciv-skin`.

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
