# landing

## Overview

Landing page sections: nav, hero with the demo, framework install tabs with pre-highlighted snippets, features, how it works, bundler band, footer, and widget controls.

## Subdirectories & Boundaries

- [demo](./demo/README.md)

## Invariants

- `try-live-button.tsx`: the button is a router link that adds `?try=1`; the widget panel follows that param, so a click before hydration still opens it.
- `copy-button.tsx`, `framework-tabs.tsx`: parts throw when used outside their `Root`
- `smooth-scroll.tsx:SmoothScroll`: smooth wheel scrolling is off under reduced motion
- `framework-tabs.tsx`: snippet data and its pre-highlighted output come from the `site-snippets` workspace package

## Side Effects

- `copy-button.tsx`: `navigator.clipboard.writeText` and a reset `setTimeout`
- `try-live-button.tsx`: `window` listener for `CONNECTION_CHANGED_EVENT`
- `theme-toggle.tsx`: `setTheme` from `next-themes`
- `framework-tabs.tsx`: `requestAnimationFrame` layout refreshes
- `github-star-link.tsx`: renders `0` on the server and the first client render, asks `/api/stars` with TanStack Query (`['github-stars']`, 10 min stale time), then springs the number from 0 to the count (at once under reduced motion); a failure or a `null` count removes the star icon and number (motion `AnimatePresence` exit to width 0, instant under reduced motion), leaving the GitHub mark alone like the other header buttons; the sr-only "{n} stars" label appears only once the count is known

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=site` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
