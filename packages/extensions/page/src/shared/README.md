# page/src/shared

## Overview

defs.ts builds each tool with a private `pageTool` helper around `defineTool`. The helper names the tool `page_<verb>` and fills in metadata: category, icon, label, hint, mutating, mirrors, approval, capture mode and keywords. The client bodies and the server declarations both build from these defs, and package.json publishes defs.ts as `./defs`. grab-attachment.ts declares the attachment for `GRAB_MIME`; client.tsx and server/grab-attachment.ts add the card and the server handler to it.

## Interface

- `PAGE_EXTENSION_NAME` = 'page', `PAGE_TOOL_PREFIX` = 'page_' (`defs.ts`)
- `PAGE_TOOL_DEFS` (`defs.ts`): const tuple of all 40 defs, in the same order as `PAGE_CLIENT_TOOLS`
- individual defs (`defs.ts`): `routeDef`, `domDef`, `queryDef`, `consoleDef`, `textDef`, `valueDef`, `attrDef`, `existsDef`, `snapshotDef`, `screenshotDef`, `hmrDef`, `locateDef`, `inspectDef`, `treeDef`, `findDef`, `overrideDef`, `trackDef`, `effectDef`, `waitDef`, `reloadDef`, `clickDef`, `hoverDef`, `scrollDef`, `submitDef`, `fillDef`, `selectDef`, `checkDef`, `uncheckDef`, `pressDef`, `setattrDef`, `removeattrDef`, `addclassDef`, `removeclassDef`, `setstyleDef`, `settextDef`, `sethtmlDef`, `removeDef`, `insertDef`, `cssDef`, `evalDef`
- `PAGE_ACT_TOOL_NAMES` (`defs.ts`): set of names of defs whose `meta.mutating` is true
- `pageVerbOfTool(name)`, `pageToolMetaOf(verb)`, `pageVerbGerund(verb)` (`defs.ts`): convert between verb and tool name, and look up metadata or the label's first word
- `ElementTarget` (`defs.ts`): shared input fields `selector`, `ref`, `name`
- schemas and types (`defs.ts`): `PagePositionSchema`, `PageWaitStateSchema`, `PageScreenshotSchema` / `PageScreenshot`, `HotUpdateWaitSchema` / `HotUpdateWait`, `PagePosition`, `PageWaitState`, `PageToolCategory`
- `HOT_UPDATE_WAIT_MS` = 5000 (`defs.ts`): default `page_hmr` timeout
- `grabAttachment` (`grab-attachment.ts`): `defineAttachment({mime: GRAB_MIME})`

## Invariants

- `pageVerbOfTool` (`defs.ts`) throws when the name does not start with `page_`
- `CAPTURE_BY_CATEGORY` (`defs.ts`) sets capture to `none` for read and react tools, `after` for act and `before-after` for edit-live; `effectDef` and `reloadDef` override it with `capture: 'none'`
- `pageTool` (`defs.ts`) sets `meta.positional = 'selector'` only when the input shape has a `selector` field
- `evalDef` (`defs.ts`) sets `approval: 'ask'`, so every page_eval call needs user approval
- `effectDef` (`defs.ts`) declares the error `UNKNOWN_EFFECT`
- `PageScreenshotSchema` (`defs.ts`) requires `width` and `height` to be positive integers; `hmrDef` input `timeout` is a coerced positive int defaulting to `HOT_UPDATE_WAIT_MS`

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-page` from the repo root (turbo builds the package and its dependencies first)
