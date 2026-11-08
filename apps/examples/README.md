# examples

## Overview

Example host apps that wire conciv into a framework through `@conciv/it` plugins: Next.js, TanStack Start, and a bare Vite host for the iOS overlay.

## Subdirectories & Boundaries

- ios: [ios/README.md](./ios/README.md) - Bare Vite host that runs the conciv engine on port 4599 with the iOS extension pointed at `native/swift/ConcivDemo`.
- nextjs-app: [nextjs-app/README.md](./nextjs-app/README.md) - Next.js example host app wired to conciv through `@conciv/it/plugin/nextjs`.
- tanstack-start: [tanstack-start/README.md](./tanstack-start/README.md) - TanStack Start (React) example host app wired to conciv through `@conciv/it/plugin/vite`.
