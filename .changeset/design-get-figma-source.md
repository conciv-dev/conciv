---
'@conciv/plugin-design': patch
---

The design plugin reads a Figma frame: `design_get` takes a Figma link and returns the design tree (nodes, implied groups, reflow, text roles, components, variable names) and its assets (image fills flattened into one PNG per node, vectors exported, the rest cropped from the frame render) under `public/design`. The Figma key is a credential of the `figma` integration: saved from the plugin's settings page or the failed `design_get` card, or read from `FIGMA_API_KEY` in the engine environment; with no key `design_get` fails with "the Figma key is missing". The `figma.token` option and the `document` input are gone.
