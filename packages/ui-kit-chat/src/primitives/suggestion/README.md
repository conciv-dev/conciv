# ui-kit-chat/src/primitives/suggestion

## Overview

Headless suggestion item: title, description and a trigger that sends the suggestion prompt.

## Interface

- `suggestion.tsx`: the `Suggestion` parts and their provider.

## Invariants

- `suggestion.tsx:useSuggestion` throws `Suggestion.* must be used within a Thread.Suggestions item` without a provider.

## Side Effects

- `suggestion.tsx:Trigger` calls the user `onClick`, then `chat.sendMessage(suggestion().prompt)`; a refused send goes to `onSendError`, or to `console.error` (`reportUnsent` in `composer-handlers.tsx`) when no `ComposerHandlersProvider` sets one. `../thread/thread.tsx:Suggestion` does the same.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
