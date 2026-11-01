# tools/src/cards

## Overview

SolidJS tool-card renderers for the chat thread. `UiCard` renders interactive prompts for `conciv_ui` and submits answers through `props.addResult`; `OpenCard` shows open-in-editor status; `ExtensionsCard` renders catalog, scaffold or validate results for `conciv_extensions`. Storybook demos: `extensions-card.stories.tsx`, `inline-cards.stories.tsx`, `ui-card.stories.tsx`.

## Interface

- `UiCard(props: ToolCardProps)` (`ui-card.tsx`): header `Rendered <kind>` with a status dot; renders Choices (buttons, or a form when `multiSelect` / `allowOther`), Confirm (Approve `'yes'` / Deny `'no'`), Diff (Apply `'apply'` / Reject `'reject'`) or Form (text/select fields to a record); shows the answer once settled.
- `OpenCard(props: ToolCardProps)` (`open-card.tsx`): titled `Open in editor`, subtitle is the last 2 path segments (prefixed `…/`) plus `:line`.
- `ExtensionsCard(props: ToolCardProps)` (`extensions-card.tsx`): title by verb (Extension catalog/scaffold/check); catalog sections, a `CodeBlock` for scaffold (`ts` when `kind === 'tool'`, else `tsx`), or an issue list for validate.

## Invariants

- `UiCard` is settled when an answer parses with `UiAnswerSchema`, a result exists, or `part.state === 'error'`; only unsettled cards show controls.
- The answer comes from the result payload first, else `part.output` (strings parsed by `safeJson`, null on failure) (`answerPayload`).
- Controls disable after the first answer (`sent` signal), blocking a second submission.
- Single-select submits a string (`values[0] ?? ''`), `multiSelect` a `string[]`; submit stays disabled with nothing chosen (`Choices`).
- A select field defaults to its first option, other fields to `''` (`defaultValue`).
- `ExtensionsCard` validates payloads with zod `looseObject` schemas (`CatalogSchema`, `ScaffoldResultSchema`, `ValidateResultSchema`) and forces status `'error'` when validate returns `ok === false`.
- Inputs are parsed with `parseInput(OpenInput | ExtensionsInput | UiInputSchema, props.part)`.

## Side Effects

- `UiCard` calls `props.addResult(value)` to send the user's answer to the tool call.
- Renders Solid components into the DOM.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/tools` from the repo root (turbo builds the package and its dependencies first)
