# ui-kit-system/src

## Overview

Source of the conciv SolidJS design system. Most files wrap `@ark-ui/solid` primitives with UnoCSS `chat-*` classes and default positioning; a few are custom (`Button` with cva, `TooltipGroup`, `Switch` motion, `AnchoredListbox`, `VirtualJsonTree`, `VirtualList`, `ZoomableImage`). It also holds the skin system and tokens, and helpers for clipboard, textarea autosize, spring motion, DOM realms, localStorage and resizing. `ui-kit-system.tsx` is the public barrel; `autosize.ts`, `motion.ts` and `tooltip-motion.ts` are internal; `realm.ts` exports `activeElementIn` (the focused element of a document or shadow root), `isDocument` and `isShadowRoot` through `ui-kit-system.tsx`. 36 `*.stories.tsx` files are Storybook demos.

## Interface

- `ui-kit-system.tsx` (export `.`): the entry.
- One file per component, each with its `*.stories.tsx`; most wrap an `@ark-ui/solid` part with the preset's classes and default positioning.
- Skins and tokens: `tokens.ts`, `derived-tokens.ts`, `skin-contract.ts`, `skins.ts`, `skin-conciv.ts`, `skin-terminal.ts`; `tokens.css` is generated from them by `src/scripts`.
- Helpers: `clipboard.ts`, `autosize.ts`, `motion.ts`, `realm.ts` (DOM realms and shadow roots), `storage.ts` (localStorage), `resize.ts`, `native-focus.tsx`.

## Invariants

- `Dialog` takes exactly one of `title` or `label` (`DialogName` union), is always `modal`, and closes on Escape or outside click only when `dismissable`. Its backdrop and positioner portal into the environment's shadow root (or the document body), so a dialog opened inside a transformed or clipped ancestor such as a virtualized thread row still covers the viewport.
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
- Every Ark part whose zag props carry a focus or blur handler is rendered through `nativeFocusPart` (`native-focus.tsx`): `@zag-js/solid` renames zag's `onFocus` / `onBlur` to `onFocusIn` / `onFocusOut`, which Solid delegates to the document, and a focus move between two elements inside one shadow root never reaches the document. `nativeFocusPart` renders the part through `asChild` and binds those two handlers as direct `on:focusin` / `on:focusout` listeners on the element, keeping a caller's own `asChild` and `ref`. Wrapped parts: `Tooltip.Trigger`, `Menu.Trigger`, `Select.Trigger`, `Tabs.Trigger` (also `TabsPrimitive.Trigger`), the `NumberInput` input, the `HoverCard` trigger, `Switch.HiddenInput`, the `Checkbox` hidden input (also `CheckboxPrimitive.HiddenInput`), `RadioGroupPrimitive.ItemHiddenInput`, `SegmentGroup.ItemHiddenInput`, `Combobox.Input` and `Combobox.Trigger`, `Listbox.Input` and `Listbox.Content`, `ToastGroup`, the `VirtualJsonTree` item and branch control, `Slider.Thumb`, `Splitter.ResizeTrigger`, the `TagsInput` input and item input, the `ColorPicker` trigger, area thumb, channel slider thumb and channel input, and the `PinInput` digit inputs. The `conciv/no-delegated-focus` lint rule rejects `onFocusIn` / `onFocusOut` JSX props in `packages/ui-kit-*/src` and `packages/frontend-defaults/src`.
- Known gap: inside the widget's shadow root, an open menu, popover, select or combobox does not close by itself when focus leaves it; Escape and a click outside do close it. The cause is in `@zag-js/interact-outside`: it reads `composedPath()` only after its deferred frame (`dist/index.mjs:131-136`), when the path is already empty, and it listens for `focusin` on the document only, which never sees a focus move inside a shadow root. Upstream issue: chakra-ui/zag#3088.
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

- Run: `pnpm typecheck` in `packages/ui-kit-system`, and `pnpm lint` at the repo root
