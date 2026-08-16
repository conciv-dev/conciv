This is a Tanstack Start application generated with
[Create Fumadocs](https://github.com/fuma-nama/fumadocs).

Run development server:

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

Deploys to [conciv.dev](https://conciv.dev) via Cloudflare Workers Builds on push to `main`
(watch paths: `apps/site/**`, `packages/{mascot,it,protocol}/**`).

## GitHub star count

The nav button and the landing ledger show the repository's star count. The worker resolves it
server-side (`src/lib/star-count-resolver.server.ts`), caches it in the Workers Cache API for an
hour and keeps the last known value for a week, so the count is in the first paint and never shows a
placeholder. `/api/stars` exposes the same cached value; the browser calls it once after hydration
to swap in a fresher number silently.

Unauthenticated GitHub API calls share a 60 requests/hour budget per IP. Set `GITHUB_TOKEN`
(any token with public repo read access) and the worker sends it as a bearer token, lifting the
budget to 5000/hour:

```bash
pnpm exec wrangler secret put GITHUB_TOKEN
pnpm exec wrangler dev --var GITHUB_TOKEN:<token>
```

The value is never logged and never reaches the client bundle.
