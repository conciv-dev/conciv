# primitives/branch-picker

## Overview

Headless branch picker for navigating message branches.

## Interface

- `branch-picker.tsx:BranchPicker` - `{Root, Previous, Next, Count, Number}`; exported as `BranchPickerPrimitive`.
- `branch-picker.tsx:BranchProvider`, `branch-picker.tsx:useBranch`, type `BranchState` (`count`, `index`, `previous`, `next`).

## Invariants

- State comes entirely from the `BranchProvider` value; the component holds none.

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
