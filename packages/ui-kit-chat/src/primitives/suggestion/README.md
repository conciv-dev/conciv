# primitives/suggestion

## Overview

Headless suggestion item: title, description and a trigger that sends the suggestion prompt.

## Interface

- `suggestion.tsx:Suggestion` - `{Title, Description, Trigger}`.
- `suggestion.tsx:SuggestionProvider`, `suggestion.tsx:useSuggestion`, type `SuggestionData` (`title`, `label`, `prompt`).

## Invariants

- `suggestion.tsx:useSuggestion` throws `Suggestion.* must be used within a Thread.Suggestions item` without a provider.

## Side Effects

- `suggestion.tsx:Trigger` calls the user `onClick`, then `chat.sendMessage(suggestion().prompt)`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
