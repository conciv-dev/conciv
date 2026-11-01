---
'@conciv/plugin': patch
---

Keep a single Solid when Vite discovers a dependency late. When the host root cannot resolve Solid, the Vite plugin now pre-bundles `solid-js`, `solid-js/web` and `solid-js/store` through `@conciv/embed`, so every pre-bundled dependency shares that one copy and modules served from `node_modules` resolve to it too. `@tanstack/solid-pacer` is pre-bundled again, so workspace-linked hosts no longer discover it after the first optimizer run, which reloaded the page and briefly loaded a second Solid.
