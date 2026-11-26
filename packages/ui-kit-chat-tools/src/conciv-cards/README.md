# ui-kit-chat-tools/src/conciv-cards

## Overview

SolidJS tool-card renderers for the chat thread. `UiCard` renders interactive prompts for `conciv_ui` and submits answers through `props.addResult`; `OpenCard` shows open-in-editor status. Storybook demos: `inline-cards.stories.tsx`, `ui-card.stories.tsx`.

## Interface

- `ui-card.tsx`: `UiCard`, header `Rendered <kind>` with a status dot; renders Choices, Confirm (Approve `'yes'` / Deny `'no'`), Diff (Apply `'apply'` / Reject `'reject'`) or Form; shows the answer once settled.
- `../conciv-cards.tsx`: `OpenCard`, titled `Open in editor`, subtitle the last 2 path segments (prefixed `…/`) plus `:line`; and the `concivToolCards` list.

## Invariants

- `UiCard` is settled when an answer parses with `UiAnswerSchema`, a result exists, or `part.state === 'error'`; only unsettled cards show controls.
- The answer comes from the result payload first, else `part.output` (strings parsed by `safeJson`, null on failure) (`answerPayload`).
- Controls disable after the first answer (`sent` signal), blocking a second submission.
- Single-select submits a string (`values[0] ?? ''`), `multiSelect` a `string[]`; submit stays disabled with nothing chosen (`Choices`).
- A select field defaults to its first option, other fields to `''` (`defaultValue`).
- Inputs are parsed with `parseInput(OpenInput | UiInputSchema, props.part)`.

## Side Effects

- `UiCard` calls `props.addResult(value)` to send the user's answer to the tool call; when that promise rejects (the host refused to send the answer), the card takes answers again.
- Renders Solid components into the DOM.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat-tools` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck`, then `pnpm lint` at the repo root
