# ui-kit-chat/src/primitives/util

## Overview

Shared building blocks for the headless primitives: the polymorphic `Primitive` elements, an action-button factory and a settle-fold open state.

## Interface

- `primitive.tsx`: the polymorphic `Primitive` elements; `create-action-button.tsx`: the action-button factory; `create-settle-fold.tsx`: an open state that follows `revealed && !folded` until the user sets it.

## Invariants

- `create-settle-fold.tsx:createSettleFold` gives a user choice (`setOpen`/`toggle`) precedence over the derived default.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
