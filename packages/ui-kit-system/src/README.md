# ui-kit-system/src

## Overview

Source of the conciv SolidJS design system. Most files wrap `@ark-ui/solid` primitives with UnoCSS `chat-*` classes and default positioning; a few are custom (`Button` with cva, `TooltipGroup`, `Switch` motion, `AnchoredListbox`, `VirtualJsonTree`, `VirtualList`, `ZoomableImage`). It also holds the skin system and tokens, and helpers for clipboard, textarea autosize, spring motion, DOM realms, localStorage and resizing. `index.tsx` is the public barrel; `autosize.ts`, `motion.ts` and `tooltip-motion.ts` are internal; `realm.ts` exports only `activeElementIn` (the focused element of a document or shadow root) and `isShadowRoot` through `index.tsx`. 25 `*.stories.tsx` files are Storybook demos.

## Interface

- `index.tsx` (export `.`): re-exports every public symbol below.
- Ark wrappers: `Avatar` (`avatar.tsx`), `Collapsible` (`lazyMount` default, animated Content; `collapsible.tsx`), `Combobox` (`combobox.tsx`), `EnvironmentProvider` (`environment.tsx`), `FocusTrap` / `FocusTrapProps` (`focus-trap.tsx`), `Menu` (`menu.tsx`), `Listbox` (`listbox.tsx`), `Popover` / `PopoverApi`, `usePopover` / `PopoverMachine` (a popover machine for `Popover.RootProvider`, same positioning defaults as `Popover.Root`; `popover.tsx`), `Presence` (`presence.tsx`), `Progress` (`progress.tsx`), `ScrollArea` (`scroll-area.tsx`), `SegmentGroup` (`segment-group.tsx`), `Select`, `createListCollection` (`select.tsx`), `Slider` (`slider.tsx`), `Splitter` (`splitter.tsx`), `Swap` (`swap.tsx`), `Switch` (draggable spring thumb; `switch.tsx`), `Tabs`, `TabsPrimitive` (`tabs.tsx`), `Toast`, `ToastGroup`, `createToaster`, `ToasterInstance` (`toast.tsx`).
- `Button`, `ButtonVariant` (solid, ghost, outline, danger, accent-soft, outline-danger, panel, link, plain), `ButtonSize` (sm, md, lg, icon, bare, none; `lg` is `md` with more padding and a 20px line, the same text size and radius) (`button.tsx`).
- `HoverCard` (`openDelay` 0, `closeDelay` 120, `sideOffset` 6; `hover-card.tsx`).
- `Editable` (`editable.tsx`): the Ark Editable parts; `Area` lays out inline, `Input` inherits the surrounding font and keeps its Escape (cancel) from reaching outer dismiss handlers.
- `Dialog`, `DialogApi` (`dialog.tsx`): props `title` or `label`, `open`, `onOpenChange`, `footer`, `role`, `initialFocus`, `restoreFocus` (true), `dismissable` (false), `size` (md/lg/xl), `layer`, `children`. `Dialog` also carries its parts, as `Menu` and `Tabs` do: `Root`, `Portal` (mounts in the environment's shadow root, else the document body), `Layer` (one element with its own stacking context at the positioner's z value, holding one dialog's `Backdrop` and `Positioner`, so a later layer covers an earlier one by document order), `Backdrop`, `Positioner`, `Content` (`size`, `aria-modal="true"` unless the caller passes its own), `Header`, `Title`, `Body`, `Footer` and `CloseTrigger` (a lucide x icon button, `aria-label` default "Close"), each styled with the ready-made dialog's classes, plus Ark's other dialog parts (`Trigger`, `Description`, `Context`). The ready-made `Dialog` is built from these parts.
- `Loader`, `LoaderSize` (`loader.tsx`): indeterminate Ark Progress; under reduced motion it is one still, evenly bright ring.
- `AnchoredListbox`, `AnchoredListboxHandle` `{listboxId, activeOptionId(), commitHighlighted(), handleKeyDown(event)}`, `AnchoredListboxRect` (`anchored-listbox.tsx`): listbox at a fixed rect that an external input can drive.
- `LIST_PANEL`, `LIST_PANEL_ITEM`, `LIST_PANEL_GROUP_LABEL`, `LIST_PANEL_MESSAGE`, `LIST_PANEL_ITEM_LABEL`, `LIST_PANEL_ITEM_DESCRIPTION` (`list-panel.ts`).
- `createClipboardCopy(options)`, `writeClipboardText(text)`, types `ClipboardCopyStatus`, `ClipboardCopyLabels`, `ClipboardCopyOptions`, `ClipboardCopy` (`clipboard.ts`); `ClipboardCopyButton`, `ClipboardCopyButtonProps`, `ClipboardCopyTooltips` (`clipboard-copy-button.tsx`; either `text`, copied through its own `createClipboardCopy` with its own polite status, or a shared `clipboard` (`ClipboardCopy`) whose state and announcements it only reflects).
- `TextField` (`size` md or lg; `lg` pads the input to a 42px frame, as tall as a `lg` `Button`), `TextArea` (`minRows` 1, `maxRows` 5, `onHeightChange`, `unstyled`), `TextAreaProps` (`text-field.tsx`).
- `Tooltip` (`tooltip.tsx`; `Tooltip.Group` = `TooltipGroup`), `TooltipGroup`, `TooltipGroupProps` (`openDelay` 400, `warmWindow` 300, `travel` 320, `lean` 0, `fuse` false; `tooltip-group.tsx`), `TooltipIconButton`, `TooltipIconButtonProps`, `TooltipIconButtonSlot`, `TooltipIconButtonSlotProps` (`tooltip-icon-button.tsx`; `keepOpenOnClick` keeps the tooltip open through a pointer down and click, which `ClipboardCopyButton` sets so its `Copied` label is seen; every other tooltip button closes on click).
- `Highlight` (`highlight.tsx`): Ark `Highlight` re-exported; marks query words in plain text with the zag `highlightWord` engine.
- `useHotkeys`, `useFormatHotkey` (`hotkeys.tsx`): Ark hotkeys re-exported; a component registers its keys for as long as it is mounted, and key hints read their platform label (`Alt+ArrowRight` is `⌥→` on mac) from `useFormatHotkey`.
- `Kbd` (`kbd.tsx`): the native `<kbd>` keycap (tinted from `currentColor`, inherits the font); `TooltipIconButton` shortcuts and every key hint render through it.
- `TruncatedText`, `TruncatedTextProps`, `TruncatedTextSide`, `createClipReveal`, `ClipReveal`, `revealTriggerProps`, `CLIP_REVEAL` (`truncated-text.tsx`).
- `VirtualJsonTree`, `VirtualJsonTreeProps` (`virtual-json-tree.tsx`), `VirtualList`, `VirtualListProps` (`virtual-list.tsx`: fixed-size rows plus an optional trailing "more" row that asks for the next page from the virtualizer's `onChange`), `ZoomableImage` (`zoomable-image.tsx`), `RelativeTime` (`relative-time.tsx`), `ByteSize` (`byte-size.tsx`: a byte count through Ark `Format.Byte`, short units), `StatusDot`, `StatusDotTone` (`status-dot.tsx`).
- `createResizable`, `Grow` (`resize.ts`); `readStorage`, `writeStorage` (`storage.ts`).
- Tokens and skins: `TOKENS`, `TokenDefinition` (`tokens.ts`, also export `./tokens`), `DERIVED_TOKENS` (`derived-tokens.ts`), `tokens.css` (export `./tokens.css`, generated), `Skin`, `SchemePair`, `SkinAnchorName`, `SKIN_ANCHOR_DOCS`, `SKIN_CLASS_PREFIX` (`'chat-skin-'`), `skinClassName` (`skin-contract.ts`), `SKINS`, `SkinName`, `DEFAULT_SKIN_NAME` (`'conciv'`), `SKIN_NAMES`, `isSkinName`, `skinDefinition` (`skins.ts`). `concivSkin` (`skin-conciv.ts`) and `terminalSkin` (`skin-terminal.ts`) are reached through `SKINS`.
- Used by `src/scripts/` but not exported from `index.tsx`: `SKIN_SCHEME_ANCHORS` (23), `SKIN_SCALAR_ANCHORS` (14), `SKIN_ANCHOR_GROUPS`, `schemePairValue`, `anchorEntries`, `anchorTokenDefinitions`, `declarationBlock`, `renderSkinCss` (`skin-contract.ts`).

## Invariants

- `Dialog` takes exactly one of `title` or `label` (`DialogName` union), is always `modal`, and closes on Escape or outside click only when `dismissable`. Its backdrop and positioner portal into the environment's shadow root (or the document body), so a dialog opened inside a transformed or clipped ancestor such as a virtualized thread row still covers the viewport. The `layer` prop is declared but not read (`dialog.tsx`).
- `Button` defaults `type` to `'button'` (`button.tsx`).
- `AnchoredListbox`: option ids are `${listboxId}-option-${value}`; `commitHighlighted` returns false with nothing highlighted; `handleKeyDown` returns false when the hidden input is not mounted and forwards a cloned event otherwise; the first item is highlighted when `collection` changes; Escape calls `onDismiss`; `onReady` gets the handle on mount and null on cleanup.
- `createClipboardCopy` returns to `'idle'` after `resetMs` (default `RESET_MS` 2000); its status signal uses `equals: false`, and synchronous throws from `writeText` become `'failed'` (`clipboard.ts`).
- `fitHeight` clamps to `rowHeight * [minRows, maxRows]` and sets `overflowY: 'auto'` only above max; `observeAutosize` refits only on `clientWidth` change, once per animation frame (`autosize.ts`). `TextArea` calls `onHeightChange` only when the height changes.
- `Loader` always forces `value={null}`; `Loader.Root` pads itself with `p-8` unless `bare` is set, since a caller padding class is not sure to win over it (`loader.tsx`).
- Every skin defines all `SKIN_SCHEME_ANCHORS` and `SKIN_SCALAR_ANCHORS` (`SkinColorPairs`, `SkinScalars` record types), and `SKIN_ANCHOR_DOCS` covers every `SkinAnchorName` (`skin-contract.ts`). `isSkinName` accepts only keys of `SKINS`.
- `createFrameLoop` clamps frame delta to [1/240s, 1/20s]; `springSettled` uses precision 0.001 (`motion.ts`).
- `createResizable` clamps to `[min, max()]`, ignores non-finite or below-min stored values, starts drags only on button 0, and calls `onCollapse` below `collapseAt` (`resize.ts`). `readStorage` / `writeStorage` swallow storage errors; `writeStorage` removes the key for null/undefined.
- `Switch.Control` ignores presses when disabled, not button 0, or already captured; slop `TAP_SLOP` 4px (fine) / 8px (touch); Escape or pointercancel restores `checkedAtPress`; with `prefersReducedMotion()` it sets translateX without a spring (`switch.tsx`).
- Inside a `TooltipGroup`, member content id is `group.labelId`, Positioner and Content render no DOM, and a warm group opens members with delay 0; it returns to idle after `warmWindow` ms (`tooltip.tsx`, `tooltip-group.tsx`). Long press opens after `LONG_PRESS` 500ms and cancels past `HOLD_SLOP` 10px. Labels flip sides when they do not fit, with `EDGE_MARGIN` 8px and `ARROW_INSET` 10px (`labelGeometry`, `tooltip-motion.ts`).
- `Tooltip.Trigger` binds the trigger's focus handlers as native `focusin` / `focusout` listeners on the trigger element (or the `asChild` element), not through Solid's document-level delegation: a focus move between two elements of one shadow root never reaches the document, so a delegated handler would never open the tooltip for a keyboard user inside the widget (`tooltip.tsx`).
- `TruncatedText` treats text as clipped only when `scrollWidth - clientWidth > ROUNDING_SLACK` (1) (`isClipped`).
- `ZoomableImage` shows the error fallback only for the failed `src` (`failed`).
- Wrappers append the caller's `class` after defaults, and caller `positioning` overrides defaults (Menu, Popover, Select).
- `tokens.css` is generated by `gen:tokens` and checked by `gen:check` (`src/scripts/generated-outputs.ts`).

## Side Effects

- `measureTextArea` appends one hidden singleton `<textarea>` to `document.body` and keeps it; `applyAutosize` writes inline `height` / `overflowY`; `observeAutosize` adds a ResizeObserver and a `document.fonts` `loadingdone` listener (`autosize.ts`).
- `writeClipboardText` writes to the clipboard through `@solid-primitives/clipboard`; `createClipboardCopy` schedules a reset timer (`clipboard.ts`).
- `AnchoredListbox` dispatches cloned `KeyboardEvent`s on its hidden input and augments `solid-js` `JSX.ExplicitAttributes` with `tabindex` (`anchored-listbox.tsx`).
- localStorage reads and writes (`storage.ts`; `createResizable` with `storageKey`).
- Window `pointermove` / `pointerup` listeners during resize drags (`resize.ts`); a window `keydown` listener per `Switch.Control`; pointer capture and inline `transform` writes on the Switch thumb (`switch.tsx`).
- `requestAnimationFrame` loops (`createFrameLoop`) and `window.matchMedia('(prefers-reduced-motion: reduce)')` reads (`motion.ts`).
- Web Animations API calls for tooltip pop, swap, glide, arrow and fuse; inline `rotate` writes for lean (`tooltip-motion.ts`, `tooltip-group.tsx`).
- While a group label is shown: capture-phase `keydown`, `focusout`, `pointerdown`, `scroll` and `resize` on window, `visibilitychange` on document, and `scroll` on the trigger's ShadowRoot; pointer and touch listeners on each grouped trigger (`tooltip-group.tsx`, `tooltip.tsx`).
- Fixed overlays at z-index 2147483647 (tooltip label, fuse bar, probe span, popover content).
- `ZoomableImage` opens its viewer in the shared `Dialog`, which portals itself; `VirtualJsonTree` scrolls through `virtualizer.scrollToIndex`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-system` from the repo root (turbo builds the package and its dependencies first)
