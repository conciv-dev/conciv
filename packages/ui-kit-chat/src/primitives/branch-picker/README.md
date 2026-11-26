# ui-kit-chat/src/primitives/branch-picker

## Overview

Headless branch picker for navigating message branches.

## Interface

- `branch-picker.tsx`: the `BranchPicker` compound and its branch context, exported as `BranchPickerPrimitive`.

## Invariants

- State comes entirely from the `BranchProvider` value; the component holds none.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
