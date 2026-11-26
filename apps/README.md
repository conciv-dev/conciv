# apps

## Overview

Deployable and runnable apps: the conciv.dev site, its install snippets, the Storybook, and example host apps that integrate conciv. The widget itself is `packages/app`.

## Subdirectories & Boundaries

- examples: [examples/README.md](./examples/README.md) - Example host apps that wire conciv into a framework through `@conciv/it` plugins: Next.js and TanStack Start.
- site: [site/README.md](./site/README.md) - The conciv.dev site: TanStack Start (React) with fumadocs MDX docs, prerendered and served from a Cloudflare Worker, with the conciv widget mounted live on the page.
- site-snippets: [site-snippets/README.md](./site-snippets/README.md) - The landing page install snippets and the generator that pre-highlights them.
- storybook: [storybook/README.md](./storybook/README.md) - Solid Storybook (`storybook-solidjs-vite`) that collects stories from `src/` and from the `packages/*` UI packages, and runs them as browser tests.
