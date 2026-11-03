---
'@conciv/plugin': patch
---

Load a single Solid in Vite hosts installed with pnpm. The Vite plugin no longer force-pre-bundles `lucide-solid/icons/wrench`, and no longer pre-bundles `@tanstack/solid-pacer` with its own copy of Solid. When the host root cannot resolve Solid, Vite cannot keep Solid external in those bundles, so they each carried a second copy of it, which caused the "You appear to have multiple instances of Solid" warning and split the reactive graph behind diff rendering.
