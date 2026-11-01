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

## Interface

- `withConciv(nextConfig)` (`next.config.ts`): wraps the Next config with the conciv plugin from `@conciv/it/plugin/nextjs`
- `register` (`instrumentation.ts`): re-export of `@conciv/it/plugin/nextjs` server instrumentation hook
- `instrumentation-client.ts`: side-effect import of `@conciv/it/plugin/nextjs/widget`, loads the widget in the browser
- `eslintConfig` (`eslint.config.mjs`): `eslint-config-next` core-web-vitals and typescript presets
- Subdirectories: [app](./app/README.md), [conciv](./conciv/README.md)

## Invariants

- `eslint.config.mjs`: `.next/**`, `out/**`, `build/**`, `next-env.d.ts` are ignored by lint

## Side Effects

- `instrumentation-client.ts`: importing `@conciv/it/plugin/nextjs/widget` mounts the conciv widget in the page
- `instrumentation.ts:register`: Next.js calls it at server start; behavior is owned by `@conciv/it`

## Verification

- Run: `cd apps/examples/nextjs-app && pnpm lint && pnpm build` (the package has no `test` or `typecheck` script)
