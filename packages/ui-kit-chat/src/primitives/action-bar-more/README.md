# primitives/action-bar-more

## Overview

Headless overflow menu for the action bar, built on `Menu` from `@conciv/ui-kit-system`.

## Interface

- `action-bar-more.tsx:ActionBarMore` - `{Root, Trigger, Content, Item, Separator}`; also exported as `ThreadListItemMore`.

## Invariants

- `action-bar-more.tsx:Root` acquires the action-bar interaction lock (`useActionBarInteraction`) while open and releases it on close and on cleanup.

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
