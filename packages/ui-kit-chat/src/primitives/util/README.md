# primitives/util

## Overview

Shared building blocks for the headless primitives: the polymorphic `Primitive` elements, an action-button factory and a settle-fold open state.

## Interface

- `primitive.tsx:Primitive` - `{div, span, form, button, img}` elements; `primitive.tsx:Slottable` type (`as`, `render` props).
- `create-action-button.tsx:createActionButton` - builds a button component from a name and a hook returning `ActionButtonState` (`run`, `disabled`) or `null`; types `ActionButtonState`, `ActionButtonProps`.
- `create-settle-fold.tsx:createSettleFold` - `{open, setOpen, toggle}`; open follows `revealed && !folded` until the user sets it.

## Invariants

- `create-settle-fold.tsx:createSettleFold` gives a user choice (`setOpen`/`toggle`) precedence over the derived default.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
