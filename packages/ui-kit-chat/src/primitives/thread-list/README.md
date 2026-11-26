# ui-kit-chat/src/primitives/thread-list

## Overview

Headless session list and list item parts driven by a `ThreadListActions` provider.

## Interface

- `thread-list.tsx`: the `ThreadList` and `ThreadListItem` compounds; `thread-list-context.tsx`: the `ThreadListActions` provider they read.

## Invariants

- `useThreadList` and `useThreadListItem` throw outside their providers.
- Optional actions in `ThreadListActions` gate the matching parts.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
