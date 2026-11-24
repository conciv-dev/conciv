# lib

## Overview

Site helpers: fumadocs source loader, SEO and JSON-LD, OG image rendering, brand asset lookup, GitHub star count, the try-it session server functions and live widget mounting, and React media-query hooks.

## Interface

- `source`, `markdownPathToSlugs`, `slugsToMarkdownPath`, `getLLMText` (`source.ts`): fumadocs loader over `content/docs`
- `getTrySession` (GET), `dismissTry` (POST) (`try-session.functions.ts`): `createServerFn` handlers for the try-it token and dismissal cookies
- `mountLiveWidget({widgetOpen, router})` (`mount-live-widget.ts`): loads `@conciv/embed` and composes the try-it plugin with its token, mounts the widget, and keeps the panel in step with the root `?try` param
- `panelCommands` (`panel-commands.ts`): the site's event-bus client for the widget panel's `open`/`close`/`toggle` commands
- `shouldAutoOpen`, `shouldDismissOnClose`, `tryButtonLabel` (`try-state.ts`)
- `pairResponse(token, origin)` (`pair-text.ts`): markdown instructions for `npx @conciv/try --token <token>`
- `renderOgImageResponse`, `OG_IMAGE_CACHE_HEADERS` (`og-render.server.ts`), `loadOgFonts` (`og-fonts.server.ts`), `buildOgTree` (`og-template.tsx`), `clampOgText`, `MAX_OG_TITLE_LENGTH`, `MAX_OG_DESCRIPTION_LENGTH` (`og-limits.ts`)
- `seo` (`seo.ts`), `buildRootJsonLd`, `buildDocsBreadcrumb`, `buildDocsPageJsonLd` (`structured-data.ts`), `buildDocsHead` (`docs-head.ts`)
- `SITE`, `DEFAULT_TITLE`, `DEFAULT_DESCRIPTION`, `docsPageUrl`, `docsOgImageUrl`, `canonicalHeadTags`, `buildSitemapXml` (`site-urls.ts`)
- `brandAssetUrl`, `BRAND_COLOURS`, `LOGO_LAYOUTS`, `LOGO_FORMATS`, `downloadFiles`, `resolveTone` and related (`brand-assets.ts`)
- `parseStarCount`, `formatStarCount`, `starsResponseSchema` (`star-count.ts`); `subscribeStarCount`, `getStarCountSnapshot` (`star-count-store.ts`)
- `rootSearchSchema` (`search-schemas.ts`): `widget?: boolean`, `try?: 1`
- `sourceAnnotations(root)`, `annotateSiteFile` (`source-annotations.ts`): build-only Vite plugin adding source locations to JSX under `src/`
- `docsRoute`, `gitConfig`, `repoUrl` (`shared.ts`), `baseOptions` (`layout.shared.tsx`), `cn` (`utils.ts`), `useIsMobile`, `useMediaQuery`, `useReducedMotion`, `easeOut`, `gsapEaseOut`

## Invariants

- `try-session.functions.ts:getTrySession`: the token cookie must parse as a UUID, otherwise a new `crypto.randomUUID()` is issued
- `try-session.functions.ts:writeTryCookie`: cookies are `httpOnly`, `secure`, `sameSite: 'lax'`, 24 h
- `try-state.ts:shouldAutoOpen`: auto-opens only when not dismissed, no `?try`, no widget present and `widgetOpen`
- `try-state.ts:shouldDismissOnClose`: dismiss only after the panel was opened and closed while not connected
- `mount-live-widget.ts:mountLiveWidget`: does nothing if `[data-conciv-root]` already exists (checked before and after the dynamic imports)
- `mount-live-widget.ts`: `?try=1` appearing opens the panel and disappearing (Back) closes it; closing the panel removes `?try` with a replace navigation
- `og-limits.ts`: OG title is clamped to 70 chars, description to 140
- `brand-assets.ts:brandAssetUrl`: throws `No brand asset emitted for <path>` for an unknown asset
- `og-fonts.server.ts:loadOgFonts`: throws when a font asset fetch is not ok

## Side Effects

- `try-session.functions.ts`: sets the `conciv-try-token` and `conciv-try-dismissed` cookies
- `mount-live-widget.ts:mountLiveWidget`: appends `<meta name="conciv-widget">` to `document.head`, mounts the widget, subscribes to the router's `onResolved`, listens to `PANEL_TOGGLED_EVENT` on `window`, calls `dismissTry` and navigates to drop `?try`
- `star-count-store.ts`: `fetch('/api/stars')` once per page
- `og-fonts.server.ts:loadOgFonts`: `env.ASSETS.fetch` from `cloudflare:workers`
- `use-media-query.ts`, `use-reduced-motion.ts`: `matchMedia` change listeners

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=site` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
