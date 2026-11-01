# primitives/activity

## Overview

Headless `Activity` root that derives turns, tool results by call id, live state and the active tool call from chat messages, for activity timelines.

## Interface

- `activity.tsx:Activity` - `{Root}`; exported as `ActivityPrimitive`.
- `activity.tsx:useActivity` - returns `turns`, `resultFor`, `live`, `label`, `isLastTurn`, `activeCall`.
- `activity.tsx:ActivityLabeler` type.

## Invariants

- `activity.tsx:useActivity` throws `Activity.* must be used within an Activity.Root`.
- Results are keyed by `toolCallId` and only `tool-result` parts with a non-empty id are indexed (`activity.tsx:resultsById`).

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
