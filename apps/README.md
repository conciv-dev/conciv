# apps

## Overview

Deployable and runnable apps: the conciv widget UI, the conciv.dev site, the Storybook, and example host apps that integrate conciv.

## Subdirectories & Boundaries

- conciv: [conciv/README.md](./conciv/README.md) - Private package `@conciv/app`: a TanStack Solid Router UI over the `@conciv/contract` rpc surface. `@conciv/embed` inlines it; it also runs standalone against a core dev server.
- examples: [examples/README.md](./examples/README.md) - Example host apps that wire conciv into a framework through `@conciv/it` plugins: Next.js and TanStack Start.
- site: [site/README.md](./site/README.md) - The conciv.dev site: TanStack Start (React) with fumadocs MDX docs, prerendered and served from a Cloudflare Worker, with the conciv widget mounted live on the page.
- storybook: [storybook/README.md](./storybook/README.md) - Solid Storybook (`storybook-solidjs-vite`) that collects stories from `src/` and from the `packages/*` UI packages, and runs them as browser tests.
