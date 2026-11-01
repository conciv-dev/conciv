# primitives/thread-list

## Overview

Headless session list and list item parts driven by a `ThreadListActions` provider.

## Interface

- `thread-list.tsx:ThreadList` - `{Root, New, Items, LoadMore}`; `thread-list.tsx:ThreadListItem` - `{Root, Trigger, Title, Archive, Unarchive, Delete}`.
- `thread-list-context.tsx:ThreadListProvider`, `useThreadList`, `ThreadListItemProvider`, `useThreadListItem`; type `ThreadListActions` (`sessions`, `activeId`, `select`, `create`, optional `archived`, `loadMore`, `hasMore`, `archive`, `unarchive`, `remove`).

## Invariants

- `useThreadList` and `useThreadListItem` throw outside their providers.
- Optional actions in `ThreadListActions` gate the matching parts.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
