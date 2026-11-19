# ui

## Overview

shadcn-style React primitives built on `radix-ui` and `class-variance-authority`, plus animated icons built on `motion/react`.

## Interface

- `Button`, `buttonVariants` (`button.tsx`), `Badge`, `badgeVariants` (`badge.tsx`), `Input` (`input.tsx`)
- `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardAction`, `CardDescription`, `CardContent` (`card.tsx`)
- `Select` and parts (`select.tsx`), `AlertDialog` and parts (`alert-dialog.tsx`), `HoverCard`, `HoverCardTrigger`, `HoverCardContent` (`hover-card.tsx`), `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` (`tooltip.tsx`), `ScrollArea`, `ScrollBar` (`scroll-area.tsx`)
- animated icons `MessageCircleIcon`, `MousePointer2Icon`, `PenIcon`, `PlugConnectedIcon`, `ShieldCheck`, `TerminalIcon` (default exports of their files)
- `AnimatedIconProps`, `AnimatedIconHandle`, `DEFAULT_STROKE_WIDTH`, `scaledStrokeWidth` (`types.ts`)

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=site` from the repo root (turbo builds the package and its dependencies first)
