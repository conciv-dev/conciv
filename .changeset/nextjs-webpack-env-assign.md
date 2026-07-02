---
'@conciv/plugin': patch
---

Fix a crash on Next.js with the webpack bundler introduced by the Turbopack env fix. `withConciv` set the engine port via `process.env.NEXT_PUBLIC_CONCIV_PORT ??= ...`. Bundlers statically replace literal `process.env.NEXT_PUBLIC_*` member expressions with their values at build time — including in the instrumentation chunk — so webpack turned the assignment target into a string literal (`"41700" ??= ...`), a `SyntaxError: Invalid left-hand side in assignment` that crashed the instrumentation hook and took down the dev server (every route 404'd / connection refused). Turbopack didn't apply the replacement in that context, so it only surfaced under `next dev --webpack`. Assign through a computed key (`process.env[key] = ...`) instead, which bundlers don't inline. Verified: the widget now mounts on the real homepage under both Turbopack and webpack.
