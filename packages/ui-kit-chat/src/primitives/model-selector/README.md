# primitives/model-selector

## Overview

Headless model picker with search, grouping and an effort selector per model.

## Interface

- `model-selector.tsx:ModelSelector` - `{Root, Trigger, Value, Content, Search, List, Empty, Group, Separator, Item, Effort}`; exported as `ModelSelectorPrimitive`.
- `model-selector.tsx:useModelSelectorContext`, `useModelSelectorEfforts`, `resolveModelEffort`, `DEFAULT_EFFORT_OPTIONS` (`low`, `medium`, `high`); types `ModelOption`, `ModelSelectorEffortOption`, `ModelSelector*Props`.

## Invariants

- Search matches the query case-insensitively against model `name`, `id` and `keywords` (`model-selector.tsx:matches`).
- `useModelSelectorContext` throws outside `ModelSelector.Root`.

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
