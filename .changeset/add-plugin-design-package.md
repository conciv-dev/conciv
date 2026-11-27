---
'@conciv/plugin-design': patch
'@conciv/cli': patch
---

New package `@conciv/plugin-design`, the conciv design plugin: the engine loads it and reads its options (the design check's settings). In dev it keys every JSX host element the dev server serves with `data-conciv-key` and every component call imported from outside `solid-js`, `react` and `react-dom` with `data-conciv-site`; the keys are never written into the files, and an element keeps its key while its file is edited. Its browser part is empty for now. `@conciv/cli` takes `diff` from the workspace catalog.
