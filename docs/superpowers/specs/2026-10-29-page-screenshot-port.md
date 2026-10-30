# Port: `page_screenshot` from the preview-branches toolbar

Date: 2026-10-29. Branch `page-screenshot`. Source: `mono/packages/preview-branches/preview-branches-toolbar/src/agent/screenshot.ts` (49 lines, snapdom 3.3.3), dispatched from `src/agent/driver.ts` as `PageVerb.SCREENSHOT`, result validated by `screenshotResultSchema` in `preview-branches-types/src/validation/parse.ts`.

## What the source does

In the page, `screenshot()` lazy-imports `@zumer/snapdom`, captures `document.documentElement` with `clip: 'viewport'`, `dpr: 1`, `exclude: [TOOLBAR_TAG, LAYER_TAG]`, `excludeMode: 'remove'`, `embedFonts: true` and one plugin, `keepBodyMargins` (snapdom zeroes the cloned body's vertical margins and draws the page too high; the plugin removes those overrides on the clone and sets `display: flow-root` on the clone root). It encodes `toBlob({format: 'webp', quality: 0.8})`, reads `{width, height}` through `createImageBitmap`, and returns `{image: <base64 without the data-URL prefix>, width, height}`. The vite build splits snapdom into its own chunk, loaded on the first call.

## Decision

Port as-is into the page extension as a new read tool. One file for the capture, one def, one server step so the model sees pixels.

- **Def** `screenshotDef` in `packages/extensions/page/src/shared/defs.ts`, verb `screenshot`, category `read`, not mutating, `icon: 'read'`, label `{running: 'Taking a screenshot', done: 'Took a screenshot'}`, summary `capture the visible viewport as a webp image`, hint `the one look at what the user sees: pixels, not DOM; for structure use page_snapshot or page_tree`, keywords `['screenshot', 'image', 'viewport', 'pixels', 'visual']`, empty input `z.object({})`, output `z.object({image: z.string(), width: z.number().int().positive(), height: z.number().int().positive()})`. Add it to `PAGE_TOOL_DEFS` next to `snapshotDef`.
- **Client body** `packages/extensions/page/src/client/screenshot.ts`: the source file verbatim, with `exclude: ['[data-conciv-root]']` (the widget host marker, the same selector `packages/page/src/element-capture.ts` uses to keep the widget out of captures) in place of the toolbar tags, and the `ScreenshotResult` type taken from the def's output schema. The `keepBodyMargins` plugin stays, comment removed (lint deletes comments; keep the behaviour, name the plugin as the source does). Wire it in `bodies.ts` like the other read tools, with a card that shows the image (see Render).
- **Dependency** `@zumer/snapdom` 3.3.3 in `packages/extensions/page` `dependencies` via `catalog:`, catalog entry in `pnpm-workspace.yaml`. Keep the `await import('@zumer/snapdom')` so the widget bundle does not grow; confirm the embed build emits a separate chunk (`packages/embed` build output) and the mount-externals build test still passes.
- **Server step** in `packages/extensions/page/src/server.ts`, the `locateServer` shape: `screenshotDef.server(async (input, _ctx, _request, page) => ...)` calls the page, parses the output schema, and returns `imageResult('image/webp', image, {width, height})` from `@conciv/extension`. The model and MCP then receive an image content block (the MCP path is already covered by `packages/core/test/api/mcp/execute-result.it.test.ts`); the CLI prints the JSON parts as it does for `ios_screenshot`.
- **Render**: the widget card for the result shows the image. Reuse an existing image card if one exists in `@conciv/ui-kit-chat` tools or another extension (check the whiteboard canvas and ios tools first); otherwise a small card in the page extension's existing card file that renders `<img src="data:image/webp;base64,...">` sized by `width`/`height`, inside the same frame the read cards use. No new design tokens.
- **System prompt**: add `page_screenshot` to the read list in `PAGE_PROMPT` ("read it with page_snapshot, page_screenshot, ...").

## Non-goals

- No `--out <file>` flag on the CLI; the CLI shape is fixed by the tool input. Open question for Omri, listed in the PR body: agents in Bash cannot view base64, so a CLI-side file sink for image parts is probably wanted; it is an API extension and needs its own yes.
- No full-page or element-scoped capture; `clip: 'viewport'` as the source.
- No MCP changes.

## Verification

- Browser test in `packages/extensions/page/test/page-tools.browser.test.tsx`: `screenshot` returns `width`/`height` matching the viewport (`window.innerWidth`/`innerHeight`), a non-empty base64 `image` that decodes to a webp (`createImageBitmap` on the blob gives the same size), and a page containing the widget host marker produces an image whose captured DOM excluded it (assert through snapdom's plugin hook or by capturing with a `[data-conciv-root]` element filling the viewport in a solid colour and sampling a pixel).
- Server step test next to the existing page server tests: the answer `{image, width, height}` becomes `[image part webp, text detail]`.
- `conciv tools page --help` lists `screenshot` (CLI derived-commands test picks it up from `PAGE_TOOL_DEFS`; update the snapshot of verbs if one exists).
- Embed: build and check the chunk split; mount-externals test green.
- Changeset: patch on `@conciv/extension-page`.
