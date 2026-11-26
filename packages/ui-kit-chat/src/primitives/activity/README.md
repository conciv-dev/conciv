# ui-kit-chat/src/primitives/activity

## Overview

Headless `Activity` root that derives turns, tool results by call id, live state and the active tool call from chat messages, for activity timelines.

## Interface

- `activity.tsx`: the `Activity` root and `useActivity`, exported as `ActivityPrimitive`.

## Invariants

- `activity.tsx:useActivity` throws `Activity.* must be used within an Activity.Root`.
- Results are keyed by `toolCallId` and only `tool-result` parts with a non-empty id are indexed (`activity.tsx:resultsById`).

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
