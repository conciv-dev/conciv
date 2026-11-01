# Spike: can takumi lay out a live page's DOM at another width instead of a hidden iframe?

takumi-js 2.19.0, `@takumi-rs/core` 2.19.0 (native darwin-arm64), `@takumi-rs/wasm` 2.19.0, `takumi-paint` 0.5.0. Playwright 1.64 Chromium. Measured 2026-11-01 on this Mac.

## Recommendation

Yes, with conditions. takumi's geometry can replace the iframe for width-dependent measurement when two things hold. The page must use CSS inside takumi's subset: no `clamp()`/`min()`/`max()` unless they are pre-resolved per width, no container queries, no JS-driven layout. The measurement must also go through `takumi-paint` with a `*{opacity:1!important;visibility:visible!important}` override, because that is the only API that names elements. Under those conditions, block, flex, grid, table, media-query and Arial text layout come out exact: 0 px error on the fixture. With SF Pro system-ui the error is ≤5 px at desktop widths and ≤11 px at 390, from roughly 1–2 % font-shaping drift. On the hardest page (conciv.dev, Tailwind v4, 501 elements) the raw run matched only 61 % of elements, with p95 89 px at 1280 and p95 226 px at 390. With the two fixes it matched 97 %, edge median 0 px and p95 25 px. The residuals come from `clamp(%)`, a `<canvas>` and per-item drift in a logo marquee. Taken element by element (each against its parent), p95 is 3–4 px.

One caution on cost. takumi is **slower** than the Chromium relayout it would replace: the paint tree takes 1.5 / 7 / 81 ms (fixture / reference / site), while Chromium resize plus reading every rect takes 0.5 / 0.7 / 14 ms. So the win is isolation (no second document, no app JS, no iframe lifecycle), not speed.

## Pages

| page      | source                                                                                                                                       | elements with a box (1280) | notes                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fixture   | `aidx-loop/packages/it/test/fixtures/design/host`, own Vite server (`configFile:false`, plugin-react, cacheDir in this spike dir, port 5741) | 33                         | Captured while `App.tsx` still rendered toolbar/field/cards/table. The other agent later reduced `App` to `return null` and added an `@media (min-width:600px)` rule. The raw JSON holds the snapshot that was measured.                                                                                                                                                    |
| reference | `aidx-loop/packages/extensions/design/scripts/reference` (appeared mid-run), own Vite server, port 5742                                      | 170                        | invoice dashboard, system-ui font, flex/grid/table                                                                                                                                                                                                                                                                                                                          |
| site      | **https://conciv.dev** (production)                                                                                                          | 501 (437 live at 390)      | Not served from `apps/site`: its dev server (TanStack Start + Cloudflare plugin + fumadocs + conciv plugin) writes `.wrangler`, `.source` and `node_modules/.vite` into aidx-loop, which the read-only rule forbids. The deployed site is the same app. It uses Tailwind v4 (`@layer`, `@property`, oklch, range media), and its live DOM includes the conciv widget panel. |

## Method

1. **Ground truth** (`scripts/collect.ts`): Chromium at 1280×800 with `reducedMotion: 'reduce'`, after `networkidle` + `document.fonts.ready` + 1.5 s. At 1280, 1100 and 390 it records every element with a non-empty `getBoundingClientRect` (document coordinates), keyed by a DOM element-child index path (`1.0.3.2`), plus tag, class, display, position, font-family and a list of features. Text nodes give `Range.getClientRects()` widths, grouped by parent element. Full-page screenshots are in `shots/*-chromium-*.png`.
2. **Two truths.** _live_ = the running app resized (its JS may react). _static_ = the serialized HTML+CSS loaded with `page.setContent` into a fresh page (no scripts), then resized. Static isolates takumi's CSS engine from app JS. For all three pages, static and live match at 1280/1100. At 390 the site's live DOM differs (JS hides parts on mobile), so the main numbers below are **vs static**.
3. **Serialization** (in Chromium, timed over 20 runs): clone `documentElement`, stamp `id="tk-<path>"` on every element without an id (an id-to-path map is kept for existing ids), copy live `<input>` values into `value=`, remove `script, link, style, noscript, template`, then take `outerHTML`. CSS = `cssText` of every rule of every `document.styleSheets[*]` and `adoptedStyleSheets` (`@media`, `@layer`, `@supports` kept verbatim). No sheet was cross-origin-blocked. `@font-face` blocks are stripped from the CSS handed to takumi, and the fonts are passed as bytes instead. Google Fonts `@import` CSS is fetched with Chromium's UA and parsed for faces.
4. **takumi** (`scripts/takumi.ts`): the same HTML string + `css` at `width` = 1280/1100/390, `height` 800, DPR 1.
   - `takumi-paint` `Painter.paint()` gives the **paint tree**. Every node carries `element: {id, tagName, className, path}`, so matching is **by the stamped id → DOM path**: exact, with no heuristics.
   - Inline elements are not boxes in the paint tree; they come back as text runs tagged with their element. Their box is the union of their runs (baseline ± ascent/descent), mapped through the text node's transform.
   - `@takumi-rs/core` `Renderer.measure()` (native) and `@takumi-rs/wasm` `Renderer.measure()` (Node, same `.wasm` the browser loads) were run for timing and cross-checking. `measure()` returns **no element identity**. A structural zip against `fromHtml`'s node tree fails, because whitespace text and inline children collapse into runs. The node-object path also rejects `translate3d(...)` in inline styles with `InvalidArg`, while the HTML-string path tolerates it.
5. **Metrics**: matched fraction; per-edge absolute error (left/top/right/bottom) median/p95/max; per-element max edge; **parent-relative** edge error (an element's error minus its nearest matched ancestor's, so cascaded shifts are separated from local ones); elements within 1 px; dropped; mis-nested (takumi parent not a DOM ancestor); text width drift per owning element. SVG internals (`path`, `g`, `circle` inside `<svg>`) are excluded from the denominator, because takumi rasterizes an `<svg>` as one image (61 on the site).
6. **Variants**: _raw_ = exactly as serialized. _fixed_ = raw plus (a) the CSS `*{opacity:1!important;visibility:visible!important}` appended (layout-neutral; recovers elements the paint tree drops because they paint nothing), and (b) `clamp()/min()/max()` whose arguments are all px/rem/vw/vh pre-resolved per width, in the CSS and inside `style="..."` attributes only.

## Accuracy (vs static Chromium; site also vs live)

| page      | variant | truth  | width | matched        | edge err px med/p95/max | per-element max err med/p95 | parent-relative edge p95/max | elements <=1px | dropped | mis-nested | text width drift px med/p95 (rel p95) |
| --------- | ------- | ------ | ----- | -------------- | ----------------------- | --------------------------- | ---------------------------- | -------------- | ------- | ---------- | ------------------------------------- |
| fixture   | raw     | static | 1280  | 33/33 (1)      | 0 / 104.5 / 1232        | 0 / 839                     | 104.5 / 1232                 | 88%            | 0       | 0          | 0.01 / 0.01 (0%)                      |
| fixture   | raw     | static | 1100  | 33/33 (1)      | 0 / 104.5 / 1052        | 0 / 839                     | 104.5 / 1052                 | 88%            | 0       | 0          | 0.01 / 0.01 (0%)                      |
| fixture   | raw     | static | 390   | 33/33 (1)      | 0 / 104.5 / 342         | 0 / 257.56                  | 104.5 / 342                  | 88%            | 0       | 0          | 0.01 / 0.01 (0%)                      |
| fixture   | fixed   | static | 1280  | 33/33 (1)      | 0 / 104.5 / 1232        | 0 / 839                     | 104.5 / 1232                 | 88%            | 0       | 0          | 0.01 / 0.01 (0%)                      |
| fixture   | fixed   | static | 1100  | 33/33 (1)      | 0 / 104.5 / 1052        | 0 / 839                     | 104.5 / 1052                 | 88%            | 0       | 0          | 0.01 / 0.01 (0%)                      |
| fixture   | fixed   | static | 390   | 33/33 (1)      | 0 / 104.5 / 342         | 0 / 257.56                  | 104.5 / 342                  | 88%            | 0       | 0          | 0.01 / 0.01 (0%)                      |
| reference | raw     | static | 1280  | 170/170 (1)    | 0 / 1.67 / 5            | 0 / 1.8                     | 1.58 / 5                     | 68%            | 0       | 0          | 1.2 / 3.15 (4%)                       |
| reference | raw     | static | 1100  | 170/170 (1)    | 0 / 1.8 / 5             | 0.59 / 4.55                 | 1.36 / 5                     | 59%            | 0       | 0          | 1.2 / 3.15 (4%)                       |
| reference | raw     | static | 390   | 170/170 (1)    | 0 / 7.38 / 11.3         | 6.28 / 8.86                 | 7.38 / 11.3                  | 22%            | 0       | 0          | 1.2 / 3 (4%)                          |
| reference | fixed   | static | 1280  | 170/170 (1)    | 0 / 1.67 / 5            | 0 / 1.8                     | 1.58 / 5                     | 68%            | 0       | 0          | 1.2 / 3.15 (4%)                       |
| reference | fixed   | static | 1100  | 170/170 (1)    | 0 / 1.8 / 5             | 0.59 / 4.55                 | 1.36 / 5                     | 59%            | 0       | 0          | 1.2 / 3.15 (4%)                       |
| reference | fixed   | static | 390   | 170/170 (1)    | 0 / 7.38 / 11.3         | 6.28 / 8.86                 | 7.38 / 11.3                  | 22%            | 0       | 0          | 1.2 / 3 (4%)                          |
| site      | raw     | static | 1280  | 307/501 (0.61) | 0 / 89.13 / 329         | 24.84 / 132                 | 36 / 329                     | 19%            | 194     | 0          | 2.11 / 21.04 (59%)                    |
| site      | raw     | live   | 1280  | 307/501 (0.61) | 0 / 89.13 / 329         | 24.84 / 132                 | 36 / 329                     | 19%            | 194     | 0          | 2.11 / 21.04 (59%)                    |
| site      | raw     | static | 1100  | 307/501 (0.61) | 0 / 79.77 / 294.44      | 24.84 / 120.33              | 32.11 / 294.44               | 18%            | 194     | 0          | 2.11 / 18.84 (56%)                    |
| site      | raw     | live   | 1100  | 307/501 (0.61) | 0 / 79.77 / 294.44      | 24.84 / 120.33              | 32.11 / 294.44               | 19%            | 194     | 0          | 2.11 / 18.84 (56%)                    |
| site      | raw     | static | 390   | 303/473 (0.64) | 42.3 / 226.08 / 890     | 106.08 / 226.08             | 42 / 890                     | 5%             | 170     | 0          | 2.11 / 10.7 (42%)                     |
| site      | raw     | live   | 390   | 267/437 (0.61) | 42.3 / 226.08 / 903.34  | 106.08 / 226.08             | 60 / 903.34                  | 6%             | 170     | 0          | 2.11 / 10.7 (42%)                     |
| site      | fixed   | static | 1280  | 488/501 (0.97) | 0 / 24.84 / 94.39       | 0.09 / 31.16                | 3.63 / 94.39                 | 56%            | 13      | 0          | 0.03 / 2.82 (3%)                      |
| site      | fixed   | live   | 1280  | 488/501 (0.97) | 0 / 24.84 / 94.39       | 0.09 / 31.16                | 3.63 / 94.39                 | 56%            | 13      | 0          | 0.03 / 2.82 (3%)                      |
| site      | fixed   | static | 1100  | 488/501 (0.97) | 0 / 24.84 / 180         | 0.11 / 31.16                | 3.64 / 180                   | 56%            | 13      | 0          | 0.03 / 2.82 (3%)                      |
| site      | fixed   | live   | 1100  | 488/501 (0.97) | 0 / 24.84 / 88          | 0.11 / 31.16                | 3.63 / 88                    | 56%            | 13      | 0          | 0.03 / 2.82 (3%)                      |
| site      | fixed   | static | 390   | 460/473 (0.97) | 0 / 24.84 / 890         | 0.02 / 31.19                | 3.23 / 890                   | 59%            | 13      | 0          | 0.02 / 2.82 (3%)                      |
| site      | fixed   | live   | 390   | 424/437 (0.97) | 0 / 17.39 / 903.34      | 0.02 / 23.48                | 2.83 / 903.34                | 64%            | 13      | 0          | 0.02 / 2.82 (3%)                      |

Reading the fixture row: the only non-zero errors are the 3 `<col>` and 1 `<colgroup>`. takumi emits them as 0×0 boxes at the table origin, while the cells they size are exact. **Excluding col/colgroup, every fixture element is 0.00 px off at all three widths** (116 edges, max 0). Text drift is 0.01 px (Arial).

### Worst 10 per page

Columns: tag | DOM path | class | display + features | max edge err px | parent-relative err px | Δ(left, top, right, bottom).

## fixture raw 1280

| colgroup | 1.0.3.0 | | table-column-group table | 1232.0 | 1232 | 0, 0, -1232, -104.5 |
| col | 1.0.3.0.2 | | table-column table | 1232.0 | 1232 | -839, 0, -1232, -104.5 |
| col | 1.0.3.0.1 | | table-column table | 839.0 | 839 | -380, 0, -839, -104.5 |
| col | 1.0.3.0.0 | | table-column table | 380.0 | 380 | 0, 0, -380, -104.5 |
| html | | | block | 0.0 | 0 | 0, 0, 0, 0 |
| body | 1 | | block | 0.0 | 0 | 0, 0, 0, 0 |
| div | 1.0 | | flex flex | 0.0 | 0 | 0, 0, 0, 0 |
| div | 1.0.0 | toolbar | flex flex | 0.0 | 0 | 0, 0, 0, 0 |
| button | 1.0.0.0 | | block | 0.0 | 0 | 0, 0, 0, 0 |
| button | 1.0.0.1 | | block | 0.0 | 0 | 0, 0, 0, 0 |

## fixture raw 390

| colgroup | 1.0.3.0 | | table-column-group table | 342.0 | 342 | 0, 0, -342, -104.5 |
| col | 1.0.3.0.2 | | table-column table | 342.0 | 342 | -257.56, 0, -342, -104.5 |
| col | 1.0.3.0.1 | | table-column table | 257.6 | 257.56 | -115.42, 0, -257.56, -104.5 |
| col | 1.0.3.0.0 | | table-column table | 115.4 | 115.42 | 0, 0, -115.42, -104.5 |
| html | | | block | 0.0 | 0 | 0, 0, 0, 0 |
| body | 1 | | block | 0.0 | 0 | 0, 0, 0, 0 |
| div | 1.0 | | flex flex | 0.0 | 0 | 0, 0, 0, 0 |
| div | 1.0.0 | toolbar | flex flex | 0.0 | 0 | 0, 0, 0, 0 |
| button | 1.0.0.0 | | block | 0.0 | 0 | 0, 0, 0, 0 |
| button | 1.0.0.1 | | block | 0.0 | 0 | 0, 0, 0, 0 |

## reference raw 1280

| h2 | 1.0.0.1.2.0.0 | panel-title | block | 5.0 | 5 | 0, 0, 5, 0 |
| button | 1.0.0.1.3.0.1 | select | flex flex | 3.9 | 3.92 | 1.81, 0, 3.92, 0 |
| span | 1.0.0.1.3.0.1.0 | caret | block | 3.9 | 2.11 | 3.77, 0, 3.92, 0 |
| span | 1.0.0.1.3.0.2 | range | block | 3.9 | 3.92 | -3.92, 0, 0, 0 |
| span | 1.0.0.1.3.2.0 | page-note | block | 3.9 | 3.92 | 0, 0, 3.92, 0 |
| span | 1.0.0.0.0.1 | logo-name | block | 3.5 | 3.52 | 0, 0, 3.52, 0 |
| button | 1.0.0.1.3.0.0 | select | flex flex | 1.8 | 1.81 | 0, 0, 1.81, 0 |
| span | 1.0.0.1.3.0.0.0 | caret | block | 1.8 | 1.81 | 1.66, 0, 1.81, 0 |
| div | 1.0.0.1.3.2.1 | pages | flex flex | 1.8 | 1.8 | -1.8, 0, 0, 0 |
| button | 1.0.0.1.3.2.1.0 | page | block | 1.8 | 1.2 | -1.8, 0, -0.59, 0 |

## reference raw 390

| span | 1.0.0.1.3.0.2 | range | block | 11.3 | 11.3 | -11.3, 0, -7.37, 0 |
| div | 1.0.0.1.3.2.1 | pages | flex flex | 9.2 | 9.17 | -9.17, 0, -7.37, 0 |
| button | 1.0.0.1.3.2.1.0 | page | block | 9.2 | 1.2 | -9.17, 0, -7.97, 0 |
| th | 1.0.0.1.3.1.0.0.3 | | table-cell table | 8.9 | 8.86 | -6.28, 0, -8.86, 0 |
| th | 1.0.0.1.3.1.0.0.4 | right | table-cell table | 8.9 | 8.86 | -8.86, 0, -7.36, 0 |
| td | 1.0.0.1.3.1.1.0.3 | | table-cell table | 8.9 | 8.86 | -6.28, 0, -8.86, 0 |
| td | 1.0.0.1.3.1.1.0.4 | right mono | table-cell table | 8.9 | 8.86 | -8.86, 0, -7.36, 0 |
| td | 1.0.0.1.3.1.1.1.3 | | table-cell table | 8.9 | 8.86 | -6.28, 0, -8.86, 0 |
| td | 1.0.0.1.3.1.1.1.4 | right mono | table-cell table | 8.9 | 8.86 | -8.86, 0, -7.36, 0 |
| td | 1.0.0.1.3.1.1.2.3 | | table-cell table | 8.9 | 8.86 | -6.28, 0, -8.86, 0 |

## site raw 1280

| h2 | 1.2.1.2.0.1 | split-parent overflow-hidden inline-bloc | inline-block overflow:hidden | 329.0 | 329 | 0, 0, -329, -36 |
| span | 1.2.1.3.0.0.1.0.2 | inline-block whitespace-nowrap | inline-block white-space:nowrap | 137.1 | 137.06 | -114.89, -36, -137.06, -72 |
| span | 1.2.1.3.0.0.1.0.2.1 | inline-block | inline-block white-space:nowrap | 137.1 | 36 | -123.47, -36, -137.06, -72 |
| div | 1.2.1.3.0.0 | min-w-0 md:sticky md:top-12 | block sticky | 132.0 | 96 | 0, -36, 0, -132 |
| h2 | 1.2.1.3.0.0.1 | od-display mb-2 text-[clamp(28px,3.4vw,4 | block | 132.0 | 96 | 0, -36, 0, -132 |
| span | 1.2.1.3.0.0.1.2.0 | inline-block whitespace-nowrap | inline-block white-space:nowrap | 132.0 | 96 | 72.38, -96, 48.44, -132 |
| span | 1.2.1.3.0.0.1.2.0.0 | inline-block | inline-block white-space:nowrap | 132.0 | 36 | 72.38, -96, 66.89, -132 |
| span | 1.2.1.3.0.0.1.2.0.1 | inline-block | inline-block white-space:nowrap | 132.0 | 36 | 66.89, -96, 53.17, -132 |
| span | 1.2.1.3.0.0.1.2.0.2 | inline-block | inline-block white-space:nowrap | 132.0 | 36 | 53.17, -96, 48.44, -132 |
| span | 1.2.1.3.0.0.1.2.1 | inline-block whitespace-nowrap | inline-block white-space:nowrap | 132.0 | 96 | 48.44, -96, -13.7, -132 |

## site raw 390

| canvas | 1.2.1.0.0 | absolute inset-0 pointer-events-none z-[ | block overflow:clip aspect-ratio | 890.0 | 890 | 0, 0, -890, 466.81 |
| html | | light lenis | block | 226.1 | 226.08 | 0, 0, 0, -226.08 |
| body | 1 | flex flex-col min-h-screen | flex flex | 226.1 | 226.08 | 0, 0, 0, -226.08 |
| div | 1.2 | od-page min-h-screen | block | 226.1 | 226.08 | 0, 0, 0, -226.08 |
| main | 1.2.1 | | block | 226.1 | 226.08 | 0, 0, 0, -226.08 |
| section | 1.2.1.3 | mx-auto max-w-[1180px] px-8 pb-24 pt-16 | block | 226.1 | 226.08 | 0, -166.08, 0, -226.08 |
| div | 1.2.1.3.0 | grid items-start gap-16 md:grid-cols-[0. | grid grid | 226.1 | 60 | 0, -166.08, 0, -226.08 |
| div | 1.2.1.3.0.0 | min-w-0 md:sticky md:top-12 | block | 226.1 | 60 | 0, -166.08, 0, -226.08 |
| h2 | 1.2.1.3.0.0.1 | od-display mb-2 text-[clamp(28px,3.4vw,4 | block | 226.1 | 60 | 0, -166.08, 0, -226.08 |
| span | 1.2.1.3.0.0.1.2.0 | inline-block whitespace-nowrap | inline-block white-space:nowrap | 226.1 | 86.11 | 86.11, -208.08, 73.86, -226.08 |

## site -extra-math 1280

| div | 1.2.1.1.1.0 | pointer-events-none absolute inset-y-0 l | block | 94.4 | 94.39 | 0, 0, -94.39, 0 |
| div | 1.2.1.1.1.1 | pointer-events-none absolute inset-y-0 r | block | 94.4 | 94.39 | 94.39, 0, 0, 0 |
| div | 1.2.1.1.1.2 | flex will-change-transform select-none r | flex transform flex | 36.1 | 36.13 | 0, 0, 36.13, 0 |
| ul | 1.2.1.1.1.2.3 | flex items-center | flex flex | 36.1 | 36.13 | 27.09, 0, 36.13, 0 |
| li | 1.2.1.1.1.2.3.6 | flex-none text-[length:var(--logoloop-lo | list-item | 36.1 | 9.03 | 35.45, 0, 36.13, 0 |
| a | 1.2.1.1.1.2.3.6.0 | inline-flex items-center no-underline ro | inline-flex flex | 36.1 | 0.67 | 35.45, 0, 36.13, 0 |
| span | 1.2.1.1.1.2.3.6.0.0 | inline-flex items-center motion-reduce:t | flex flex | 36.1 | 0.67 | 35.45, 0, 36.13, 0 |
| span | 1.2.1.1.1.2.3.6.0.0.0 | inline-flex items-center gap-2.5 font-mo | flex flex | 36.1 | 0.67 | 35.45, 0, 36.13, 0 |
| li | 1.2.1.1.1.2.3.5 | flex-none text-[length:var(--logoloop-lo | list-item | 35.5 | 8.36 | 33.88, 0, 35.45, 0 |
| a | 1.2.1.1.1.2.3.5.0 | inline-flex items-center no-underline ro | inline-flex flex | 35.5 | 1.58 | 33.88, 0, 35.45, 0 |

## site -extra-math 390

| canvas | 1.2.1.0.0 | absolute inset-0 pointer-events-none z-[ | block overflow:clip aspect-ratio | 890.0 | 890 | 0, 0, -890, 572.89 |
| div | 1.2.1.1.1.2 | flex will-change-transform select-none r | flex transform flex | 36.1 | 36.13 | 0, 0, 36.13, 0 |
| ul | 1.2.1.1.1.2.3 | flex items-center | flex flex | 36.1 | 36.13 | 27.09, 0, 36.13, 0 |
| li | 1.2.1.1.1.2.3.6 | flex-none text-[length:var(--logoloop-lo | list-item | 36.1 | 9.03 | 35.45, 0, 36.13, 0 |
| a | 1.2.1.1.1.2.3.6.0 | inline-flex items-center no-underline ro | inline-flex flex | 36.1 | 0.67 | 35.45, 0, 36.13, 0 |
| span | 1.2.1.1.1.2.3.6.0.0 | inline-flex items-center motion-reduce:t | flex flex | 36.1 | 0.67 | 35.45, 0, 36.13, 0 |
| span | 1.2.1.1.1.2.3.6.0.0.0 | inline-flex items-center gap-2.5 font-mo | flex flex | 36.1 | 0.67 | 35.45, 0, 36.13, 0 |
| li | 1.2.1.1.1.2.3.5 | flex-none text-[length:var(--logoloop-lo | list-item | 35.5 | 8.36 | 33.88, 0, 35.45, 0 |
| a | 1.2.1.1.1.2.3.5.0 | inline-flex items-center no-underline ro | inline-flex flex | 35.5 | 1.58 | 33.88, 0, 35.45, 0 |
| span | 1.2.1.1.1.2.3.5.0.0 | inline-flex items-center motion-reduce:t | flex flex | 35.5 | 1.58 | 33.88, 0, 35.45, 0 |

What drives each page's worst list:

- **fixture**: `<col>`/`<colgroup>` only (0-size boxes in the paint tree). Everything else is exact.
- **reference 1280/1100**: ≤5 px horizontal. These are text-sized boxes (`h2.panel-title` +5, `.select` +3.9, `.logo-name` +3.5) whose width is one SF Pro string. **390**: the table becomes narrow enough that auto table layout redistributes column widths from text min/max-content, so the 1–2 % per-string drift moves `th/td` edges 6–9 px and the right-aligned `.range` and `.pages` 9–11 px. Every edge is horizontal; vertical error is 0 everywhere.
- **site raw**: (1) `clamp(28px, 3.4vw, 40px)` font sizes are **dropped** by takumi, so headings fall back to 16 px (the h2 is 231 px wide instead of 561, and `h1` is 16 px tall instead of 190). That cascades every element below by 36–226 px. (2) 194 dropped elements: `opacity:0` scroll-reveal cards and `visibility:hidden` elements are **absent from the paint tree**, because it only lists nodes that paint.
- **site fixed**: (1) two `absolute` fade masks with `width: clamp(24px, 8%, 120px)`. A percentage can't be pre-resolved, so takumi gives them width 0 (94 px error). (2) The logo marquee: each `li` is 0.7–9 px wider (mono font plus SVG icon sizing), which accumulates to 36 px across 28 items in a `width:max-content` track. (3) At 390, a `<canvas>` with `aspect-ratio` and `inset-0` (890 px): Chromium sizes it from its `width`/`height` attributes, takumi does not. The 13 remaining drops are `<br>` and inline `span`s that contain only inline-blocks, which have no runs of their own.
- **mis-nesting**: 0 on all pages. In the paint tree, an `<svg>` is a box with an image child carrying the same element. That is counted as correct.

### `@media (min-width: 600px)` check

The fixture's current `styles.css` rule `@media (min-width: 600px) { .toolbar { padding-right: 24px } }` was applied to the captured fixture DOM:

| width | Chromium toolbar x/w, Export x, Create x/w                        | takumi                                  |
| ----- | ----------------------------------------------------------------- | --------------------------------------- |
| 390   | 24/342, 165.97, 285.97/80.03 (Create right edge 366 = no padding) | identical: 24/342, 165.97, 285.97/80.03 |
| 1100  | 24/640, 439.97, 559.97/80.03 (right edge 640 = 664 − 24 padding)  | identical: 24/640, 439.97, 559.97/80.03 |

**Yes**: takumi applies the rule at 1100 and not at 390, and the boxes match to 0.01 px (`raw/media-check.json`). Range syntax (`width >= 40rem`) and `not all and (...)` also evaluate correctly (`raw/feature-probe.txt`).

### CSS subset probe (`scripts/features.ts`, `raw/feature-probe.txt`)

| works                                                                                                                                                                                                                                                                                                                       | does not work (declaration dropped, falls back to auto)                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| escaped Tailwind selectors (`.w-\[100px\]`), `calc()`+`var()`, `vw` in `calc`, `@layer`, `@supports`, `@property`, `:where()`, `:is()`, `>`, oklch, `@media` min-width and range syntax, `::before`, `position: sticky` (laid out as static/relative, which matches Chromium at scroll 0), `:hover` correctly never matches | `clamp()`, `min()`, `max()` (even px-only), container queries (`@container` ignored), `font-variation-settings: 'opsz'` (no width change) |

`overflow:auto` does not change child layout in either engine, so it costs nothing for geometry.

## Timing (warm, 20 runs after 2 warm-ups)

| page      | width | native measure ms med/p95 | @takumi-rs/wasm measure ms med/p95 | takumi-paint (wasm) paint tree ms med/p95 | Chromium resize+read round trip ms med/p95 | Chromium in-page layout+read ms med/p95 | nodes native=wasm | paint boxes found in native |
| --------- | ----- | ------------------------- | ---------------------------------- | ----------------------------------------- | ------------------------------------------ | --------------------------------------- | ----------------- | --------------------------- |
| fixture   | 1280  | 0.26 / 0.3                | 0.82 / 1                           | 1.49 / 1.62                               | 0.51 / 0.62                                | 0 / 0.1                                 | max diff 0px      | 35/35                       |
| fixture   | 1100  | 0.26 / 0.32               | 0.65 / 0.68                        | 1.36 / 2.58                               | 0.53 / 0.66                                | 0 / 0.1                                 | max diff 0px      | 35/35                       |
| fixture   | 390   | 0.26 / 0.28               | 0.6 / 0.7                          | 0.96 / 1.11                               | 0.54 / 0.59                                | 0 / 0.1                                 | max diff 0px      | 35/35                       |
| reference | 1280  | 2.05 / 2.31               | 3.96 / 4.9                         | 6.93 / 7.73                               | 0.68 / 1                                   | 0.1 / 0.2                               | max diff 0px      | 182/182                     |
| reference | 1100  | 1.85 / 1.92               | 3.6 / 3.76                         | 6.35 / 6.92                               | 0.68 / 0.89                                | 0.1 / 0.2                               | max diff 0px      | 182/182                     |
| reference | 390   | 2.16 / 2.31               | 3.81 / 4                           | 6.27 / 7.56                               | 0.73 / 1.12                                | 0.1 / 0.2                               | max diff 0px      | 182/182                     |
| site      | 1280  | 41.64 / 43.94             | 74.86 / 80.05                      | 81.27 / 84.62                             | 13.89 / 14.86                              | 0.4 / 0.4                               | max diff 0px      | 389/389                     |
| site      | 1100  | 41.76 / 46.04             | 73.59 / 78.41                      | 80.56 / 82.45                             | 14.44 / 20.07                              | 0.3 / 0.4                               | max diff 0px      | 389/389                     |
| site      | 390   | 40.2 / 40.49              | 69.22 / 72.59                      | 77.09 / 93.58                             | 16.26 / 20.19                              | 0.3 / 0.4                               | max diff 0px      | 383/383                     |

| page      | html bytes | css bytes | serialize ms med/p95 (in Chromium, 20 runs) |
| --------- | ---------- | --------- | ------------------------------------------- |
| fixture   | 1496       | 2029      | 0.1 / 0.2                                   |
| reference | 9473       | 4862      | 0.5 / 0.6                                   |
| site      | 165788     | 166678    | 4.2 / 4.6                                   |

wasm sizes {"takumi-paint wasm":2920601,"@takumi-rs/wasm":4213356}
fixture fonts: 5 Arial 400, Arial 700
reference fonts: 3 system-ui 700, Apple Symbols 400, system-ui 400, system-ui 600

- The native and wasm `measure()` give **identical boxes** (max diff 0 px on every node at every width). Every `takumi-paint` box is found exactly in the native `measure()` output, so the paint tree and the native layout agree. The wasm build was run in Node's V8, from the same `.wasm` file the browser entry loads, not inside a Chromium page.
- **WASM bundle sizes**: `@takumi-rs/wasm` `takumi_wasm_bg.wasm` = 4,213,356 B (4.0 MiB raw); `takumi-paint` `takumi_paint_wasm_bg.wasm` = 2,920,601 B (2.8 MiB). Pre-compression sizes; gzip/brotli not measured.
- **Chromium baseline**: "round trip" = `page.setViewportSize(width)` from a different width, plus one `evaluate` reading every element's rect, timed from Node (includes the CDP IPC). "in-page" is the rect loop alone: it is ~0, because layout already happened inside the resize. The Chromium relayout is therefore 0.5 / 0.7 / 14–16 ms. takumi with identity (paint tree, wasm) is 1.5 / 6.5 / 80 ms. Native `measure()` is 0.3 / 2 / 41 ms but carries no element identity. Not measured: creating and loading a hidden iframe (document parse, app boot, font load), which an iframe pays once and takumi never pays.
- **Serialization in Chromium**: 0.1 / 0.5 / 4.2 ms (HTML 1.5 / 9.5 / 166 KB, CSS 2 / 4.9 / 167 KB after removing `@font-face`).

## Fonts

takumi never reads system fonts. Each run registered only the faces the page uses, in the same order on all three backends.

| page      | computed font-family                                                                                 | bytes given to takumi                                                                                                                                                                                                                                                                                                                                                                | effect                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fixture   | `Arial, sans-serif` (32/33 elements)                                                                 | `/System/Library/Fonts/Supplemental/Arial.ttf`, `Arial Bold.ttf`, `Arial Italic.ttf`, `Arial Bold Italic.ttf`, read in place, never copied (Arial registered as `generic: sans-serif`)                                                                                                                                                                                               | **exact**: text width drift 0.01 px, every box 0.00 px                                                                                                                                                                                                                                                                                                         |
| reference | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`                                           | `/System/Library/Fonts/SFNS.ttf` registered as `system-ui` and `-apple-system`; `Apple Symbols.ttf` as glyph fallback for the nav icons                                                                                                                                                                                                                                              | 1–2 % per-string drift. Chromium (CoreText) applies optical size and tracking to the system font; takumi applies neither, and `font-variation-settings:'opsz' N` changes nothing (`raw/text-probe-sf.txt`: "Northwind Traders" 14 px is 119.59 Chromium vs 122.14 takumi; "$126,890.40" 26 px bold is 161.75 vs 159.35). Median text drift 1.2 px, p95 3.2 px. |
| site      | `"Geist Variable"` (327), `ui-monospace, SFMono-Regular, Menlo…` (181), `"Bricolage Grotesque"` (54) | 34 `@font-face` sources: Geist Variable woff2 ×5 unicode-range subsets, JetBrains Mono / Archivo / Source Sans 3 from base64 data URLs, Bricolage Grotesque + JetBrains Mono from Google Fonts with `unicode-range`. Plus `SFNSMono.ttf` as `ui-monospace` (generic monospace), `SFNS.ttf` as `system-ui`, and Apple Symbols. woff2, variable `wght` and `unicode-range` all worked. | With the fixes, median text drift is 0.02–0.03 px and p95 2.8 px; the residual is in the SF Mono marquee labels and Bricolage's `opsz` axis (the page sets `font-optical-sizing:auto`).                                                                                                                                                                        |

Liberation Sans was not needed: the macOS files were readable in place for a local measurement.

## Artifacts

- `raw/<page>-chromium.json`: ground truth (live and static), serialized HTML/CSS, id→path map, font faces, timing.
- `raw/<page>-takumi.json`: raw variant. `raw/<page>-takumi-extra-math.json`: fixed variant. Both hold per width: vs live / vs static stats, worst 10 absolute and parent-relative, dropped sample, fonts used, timings.
- `raw/reference-takumi-opsz-experiment.json`: the opsz override run (no change).
- `raw/media-check.json`, `raw/feature-probe.txt`, `raw/text-probe-sf.txt`, `raw/summary-tables.md`, `raw/worst.txt`.
- `shots/<page>-chromium-<w>.png` (live, full page), `shots/<page>-chromium-static-<w>.png`, `shots/<page>-takumi[-math]-<w>.png` (native render, 800 px canvas).
- `scripts/collect.ts`, `takumi.ts`, `media.ts`, `features.ts`, `textprobe.ts`, `summarize.ts`, `serve-fixture.ts`, `probe*.ts`.

## Caveats

- A paint tree only contains what paints. Geometry for invisible elements needs the opacity/visibility override. That override is layout-neutral, but it must not override `display:none`.
- `clamp`/`min`/`max` pre-resolution only covers px/rem/vw/vh arguments. Anything with `%`, `em` or `var()` inside stays unresolved and drops out.
- `rem` assumes a 16 px root. takumi's JS options don't expose the root font size.
- The site was measured from production, not from `apps/site` at the aidx-loop commit.
- The fixture DOM is the version from before the other agent's rewrite.
