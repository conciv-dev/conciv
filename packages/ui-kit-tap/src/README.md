# ui-kit-tap/src

## Overview

TipTap editors for SolidJS: `RichTextField`, a plain-text composer with slash and mention triggers, and `MentionField`, a composer that submits text and mention segments. Shared pieces cover the ProseMirror schema, text and position mapping, trigger suggestions and the trigger menu.

## Interface

- `rich-text-field.tsx`, `mention-field.tsx`: the two fields; `RichTextField`'s handle focuses, clears, inserts, appends and selects.
- `trigger-suggestions.ts`, `trigger-menu.tsx`: the slash and mention trigger sources (sync or async `items(query)`), the menu keys, and the suggestion popup. A picked chip shows and lowers to the item's `insert` when set.
- `field-schema.ts`, `lowering.ts`: the ProseMirror schema (Document, Paragraph, Text, mention chip) and the map between plain text offsets and ProseMirror positions.
- `ui-kit-tap.tsx`: the entry. `*.stories.tsx`: Storybook stories for the two fields.

## Invariants

- `rich-text-field.tsx:enterAction` - Enter submits; Shift+Enter splits the block.
- `mention-field.tsx:submitsOnEnter` - Enter without Shift submits.
- `trigger-suggestions.ts:ChipForwardDelete` - Delete with an empty selection removes the mention chip right after the cursor.
- `lowering.ts:projectDocument` - paragraphs join with `\n` and chips count as their `leafText`.
- `trigger-suggestions.ts:commitItem` - picking an item with `run` deletes the typed trigger text and calls `run` instead of inserting a chip.
- `trigger-suggestions.ts:triggerSuggestion` - a source whose `items` throws yields no items and the `error` menu status for that query, unless the fetch was aborted.

## Side Effects

- `rich-text-field.tsx` / `mention-field.tsx` - create a TipTap `Editor` on the host element and `destroy()` it in `onCleanup`.
- `rich-text-field.tsx:RichTextFieldHandle.focus` and the trigger menu `onRefocus` - move focus into the editor.
- `trigger-suggestions.ts:triggerSuggestion` - calls the source's `items(query)`, which may be async.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-tap` from the repo root (the package has no `test` script)
