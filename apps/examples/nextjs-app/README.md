# nextjs-app

## Overview

Next.js example host app wired to conciv through `@conciv/it/plugin/nextjs`.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Invariants

- `next.config.ts` wraps the Next config with `withConciv` from `@conciv/it/plugin/nextjs` and loads the workspace plugins `@conciv/plugin-test-runner`, `@conciv/plugin-tanstack` and `@conciv/plugin-whiteboard` by their `node_modules` path; an app outside this repo names a plugin by package, e.g. `plugins: ['@conciv/plugin-test-runner']`.
- `instrumentation.ts` re-exports `register` from `@conciv/it/plugin/nextjs`; `instrumentation-client.ts` imports `@conciv/it/plugin/nextjs/widget`.
- `eslint.config.mjs`: `.next/**`, `out/**`, `build/**`, `next-env.d.ts` are ignored by lint
- Subdirectories: [app](./app/README.md)

## Side Effects

- `instrumentation-client.ts`: importing `@conciv/it/plugin/nextjs/widget` mounts the conciv widget in the page
- `instrumentation.ts:register`: Next.js calls it at server start; behavior is owned by `@conciv/it`

## Verification

- Run: `pnpm exec turbo run build --filter=nextjs-app` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` or `typecheck` script)
