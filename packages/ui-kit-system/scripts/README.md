# ui-kit-system/scripts

## Overview

Node scripts, run with `node` directly on `.ts` files, that generate the design-token CSS and two Markdown contract docs from the typed skin definitions in `src/`, and check that the committed copies are current. `gen-tokens.ts` writes the files; `check-tokens.ts` fails when they drift.

## Interface

- `gen-tokens.ts` (`pnpm gen:tokens`): writes every `generatedOutputs()` entry.
- `check-tokens.ts` (`pnpm gen:check`): compares each generated output with the committed file.
- `generatedOutputs()`, `GeneratedOutput {path, label, content}` (`generated-outputs.ts`): `src/tokens.css`, `docs/skin-anchors.md`, `docs/extension-tokens.md`.
- `renderTokensCss()`, `renderBaseTokensCss()` (`render-tokens.ts`): `:host,:root` with `color-scheme: light dark`, base-skin anchors and `DERIVED_TOKENS`, `.light` / `.dark` rules, and one `renderSkinCss` block per overlay skin.
- `renderSkinContractDoc()`, `renderExtensionContractDoc()` (`contract-docs.ts`): the "Skin author contract" and "Extension author contract" docs (the latter with utility tables from `chatColors`, `chatRadius`, `chatFont`, `chatEase` in `@conciv/uno-preset`).
- `BASE_SKIN` (`concivSkin`), `OVERLAY_SKINS` (`[terminalSkin]`), `ALL_SKINS` (`generated-skins.ts`).

## Invariants

- Committed `src/tokens.css` and both docs must equal the generated content byte for byte; otherwise `check-tokens.ts` prints the drifted labels and calls `process.exit(1)`. A missing file counts as drift.
- The base skin is emitted on `:root` / `:host` with no class; overlay skins are emitted through `renderSkinCss` and selected by `skinClassName(name)`.
- Scheme anchors (`SKIN_SCHEME_ANCHORS`) are documented as `{light, dark}` pairs, scalar anchors (`SKIN_SCALAR_ANCHORS`) as single values (`anchorTable`); `escapeCell` escapes pipes.

## Side Effects

- `gen-tokens.ts` creates parent dirs (`mkdirSync` recursive) and writes `src/tokens.css`, `docs/skin-anchors.md`, `docs/extension-tokens.md`.
- `check-tokens.ts` reads those files, logs to the console and exits 1 on drift.

## Verification

- Run: `cd packages/ui-kit-system && pnpm gen:check`; typecheck with `pnpm typecheck` (`tsconfig.scripts.json`).
