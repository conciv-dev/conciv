---
"@conciv/it": patch
---

Motion pass across the widget and site (subtler entrances, interruptible open/close, reduced-motion gates, transform-based movement, token cohesion), plus site-embedding fixes: resolve `@conciv/embed` to an absolute path so consumer apps do not declare it, skip widget injection into nested frames, and dedupe the Solid singletons (`solid-js`, `@tanstack/solid-router`, `@ark-ui/solid`) so embedders load a single copy.
