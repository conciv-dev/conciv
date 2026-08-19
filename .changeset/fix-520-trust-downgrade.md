---
'@conciv/solid-diffs': patch
'@conciv/extension-whiteboard': patch
---

Pins `@pierre/diffs` to the exact `1.2.11` release (its `^1.2.11` range let consumers resolve `1.3.5`, which pulls the unattested `@pierre/theme@2.0.0`) and adds a direct `cytoscape@3.34.0` pin in the whiteboard extension so mermaid's own `^3.33.3` range dedupes to the attested release instead of `3.34.1`. Fixes a fresh `pnpm add -D @conciv/it` failing with `ERR_PNPM_TRUST_DOWNGRADE` under pnpm's `trustPolicy: no-downgrade` (#520).
