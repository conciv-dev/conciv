# components

## Overview

Shared React components for the site: MDX component map, client-only Mermaid, the live widget mount, the 404 page, and GSAP/pointer animation components.

## Subdirectories & Boundaries

- [brand](./brand/README.md), [landing](./landing/README.md), [ui](./ui/README.md)

## Invariants

- `live-widget-mount.tsx:LiveWidgetMount`: renders nothing on mobile (`useIsMobile`), and nothing on docs pages below `md` so the launcher never covers docs content
- `AnimatedContent.tsx`, `SplitText.tsx`: GSAP plugins are registered only outside SSR (`!import.meta.env.SSR`)

## Side Effects

- `live-widget-mount.tsx:LiveWidgetMount`: loads and mounts the conciv widget in the browser
- `Magnet.tsx`: `window` `mousemove` listener; `LogoLoop.tsx`: `window` `resize` listener and `IntersectionObserver`; `ClickSpark.tsx`: resize `setTimeout`; `VariableProximity.tsx`: `pointermove` listener

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=site` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
