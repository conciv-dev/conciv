# components

## Overview

Shared React components for the site: MDX component map, client-only Mermaid, the live widget mount, the 404 page, and GSAP/pointer animation components.

## Interface

- `LiveWidgetMount` (`live-widget-mount.tsx`): client-only lazy `LiveWidget` driven by the root `widget` and `try` search params
- `useMDXComponents` / `getMDXComponents` (`mdx.tsx`): MDX component map for fumadocs pages
- `Mermaid({chart})` (`mermaid.tsx`), `MermaidContent` (`mermaid-content.tsx`): client-only diagram rendering
- `NotFound` (`not-found.tsx`): default not-found component
- `AnimatedContent`, `SplitText` (GSAP `ScrollTrigger`), `ClickSpark`, `Magnet`, `VariableProximity`, `LogoLoop`, `LogoItem` (default or named exports of their files)
- Subdirectories: [brand](./brand/README.md), [landing](./landing/README.md), [ui](./ui/README.md)

## Invariants

- `live-widget-mount.tsx:LiveWidgetMount`: renders nothing on mobile (`useIsMobile`)
- `AnimatedContent.tsx`, `SplitText.tsx`: GSAP plugins are registered only outside SSR (`!import.meta.env.SSR`)

## Side Effects

- `live-widget-mount.tsx:LiveWidgetMount`: loads and mounts the conciv widget in the browser
- `Magnet.tsx`: `window` `mousemove` listener; `LogoLoop.tsx`: `window` `resize` listener and `IntersectionObserver`; `ClickSpark.tsx`: resize `setTimeout`; `VariableProximity.tsx`: `pointermove` listener

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=site` from the repo root (turbo builds the package and its dependencies first)
