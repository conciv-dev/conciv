# ui-kit-tap/src

## Overview

TipTap editors for SolidJS: `RichTextField`, a plain-text composer with slash and mention triggers, and `MentionField`, a composer that submits text and mention segments. Shared pieces cover the ProseMirror schema, text and position mapping, trigger suggestions and the trigger menu.

## Interface

- `rich-text-field.tsx:RichTextField` - props `value`, `onValueChange`, `onSubmit`, `onSelectionChange`, `initialSelection`, `placeholder`, `label`, `disabled`, `minRows`, `maxRows`, `onPaste`, `onReady`, `slashTrigger`, `mentionTrigger`, class props.
- `rich-text-field.tsx:RichTextFieldHandle` - `focus({end?})`, `clear()`, `insertText(text)`, `appendText(text)`; `RichTextFieldSelection` is `{start, end}`.
- `mention-field.tsx:MentionField` - props `items(query)`, `onSubmit(segments)`, `onReady(api)`, `onEmptyChange`, `placeholder`, `ariaLabel`, `class`.
- `mention-field.tsx:MentionFieldApi` / `MentionItem` / `MentionSegment` - exported types.
- `trigger-suggestions.ts:RichTextFieldTriggerSource` - `{label, categories?, items(query)}` (sync or async items); `RichTextFieldTriggerItem`, `RichTextFieldTriggerCategory`.
- `trigger-suggestions.ts:triggerSuggestion` / `triggerMenuKeyDown` / `dismissTrigger` / `ChipForwardDelete` - suggestion config, menu keys and the Delete shortcut for chips.
- `trigger-menu.tsx:TriggerMenu` / `createTriggerMenu` / `triggerPopupAttributes` - the suggestion popup and its controller.
- `field-schema.ts:fieldSchema` / `documentExtensions` / `chipExtension` - the schema (Document, Paragraph, Text, mention chip).
- `lowering.ts:projectDocument` / `buildDocument` / `paragraphFragment` / `offsetToPosition` / `positionToOffset` - map between plain text offsets and ProseMirror positions.
- `index.tsx` - exports `MentionField`, `RichTextField` and their types.
- `*.stories.tsx` - Storybook stories for the two fields.

## Invariants

- `rich-text-field.tsx:enterAction` - Enter submits; Shift+Enter splits the block.
- `mention-field.tsx:submitsOnEnter` - Enter without Shift submits.
- `trigger-suggestions.ts:ChipForwardDelete` - Delete with an empty selection removes the mention chip right after the cursor.
- `lowering.ts:projectDocument` - paragraphs join with `\n` and chips count as their `leafText`.
- `trigger-suggestions.ts:triggerSuggestion` - a source whose `items` throws yields no items and the `error` menu status for that query, unless the fetch was aborted.

## Side Effects

- `rich-text-field.tsx` / `mention-field.tsx` - create a TipTap `Editor` on the host element and `destroy()` it in `onCleanup`.
- `rich-text-field.tsx:RichTextFieldHandle.focus` and the trigger menu `onRefocus` - move focus into the editor.
- `trigger-suggestions.ts:triggerSuggestion` - calls the source's `items(query)`, which may be async.

## Verification

- Run: `cd packages/ui-kit-tap && pnpm test`
