# Composer actions collapse & session refresh extraction

> **Superseded by implementation.** This is a point-in-time planning doc; the shipped API diverges
> from what's described below. The shipped surface is `Action`/`ActionButton`/`ActionMenuItem`/`Inline`
> plus `Leading`/`Trailing`/`Trigger` slots from `@conciv/ui-kit-chat` — no ids, actions register with
> the host via context (not JSX tokens), and refresh lives on `PaneContext.chat` rather than a
> `RefreshHandle`. Source of truth: `packages/ui-kit-chat/src/primitives/composer/composer-actions.tsx`.

Date: 2026-08-16
Status: revised after codex (gpt-5.6-sol) adversarial review

## Problem

The widget composer toolbar row is saturated with icon buttons: attachment paperclip, grab
(select element), new session, compact, launch menu, extension-contributed buttons (whiteboard
canvas, whiteboard comment, tanstack), model selector, refresh, send/cancel. Every extension that
adds a composer button makes it worse, and nothing adapts to panel width. Additionally the
"Refresh the conversation" control (stream re-subscribe) is a session-level affordance that has no
business living in the composer.

## Goals

- Only a small number of action buttons visible inline in the composer; the rest live in a single
  overflow dropdown menu.
- Extension authors keep authoring plain JSX: they declare _what_ to show; the host decides _when
  and how_ (inline vs dropdown).
- Automatic collapse driven by measured container width, regardless of per-button config, so the
  composer works at every panel size.
- Refresh removed from the composer contract entirely; standalone session-scoped `RefreshButton`
  usable on any surface that has a chat context.

## Non-goals

- No declarative action-registry public API (rejected: extensions author JSX, not data).
- No `visible="menu"` state (dropdown-only expressed structurally: provide only `DropdownItem`s).
- No changes to attachment paperclip, model selector, or send/cancel — they are not "actions" and
  stay outside the collapsible group (but their widths participate in the fit budget, see §2).
- No back-compat shims (v0).

## Design

### 1. `ComposerActions.*` compound primitives

New public primitives, exported through the `@conciv/extension` surface (single import point for
extension authors). Authoring shape:

```tsx
function MyExtensionButton() {
  return (
    <ComposerActions.Root id="whiteboard.canvas" priority={20} disabled={busy}>
      <ComposerActions.Button visible="auto" tooltip="Open the whiteboard canvas" onClick={open}>
        <Presentation />
      </ComposerActions.Button>
      <ComposerActions.DropdownItem value="open" label="Open the whiteboard canvas" onSelect={open}>
        <Presentation />
      </ComposerActions.DropdownItem>
    </ComposerActions.Root>
  )
}
```

- `Root` props: `id` (stable, unique), `priority` (higher = keeps inline slot longer; default 0),
  `disabled?: () => boolean` — the single reactive disabled/pending source consumed by BOTH
  renderings. Inline button and menu items can never disagree; disabled Ark items stay in the
  collection but are skipped by arrow/typeahead navigation (Ark default).
- `Button` props: `visible?: 'auto' | 'always'` (default `'auto'`), `tooltip`, `onClick`. Renders
  `TooltipIconButton`.
- `DropdownItem` props: `value` (required, stable; namespaced by the host as `${rootId}:${value}`
  for Ark collection identity), `label`, `onSelect`, icon child. Renders an Ark `Menu.Item`
  portaled into the host's shared overflow menu content node.
- A `Root` may contain MULTIPLE `DropdownItem`s, including conditional sets (`Show`/`Switch`).
  When collapsed, all its items appear flattened in the overflow menu, grouped contiguously in
  priority order. This is how the launch menu migrates (see §3).
- Semantics by structure:
  - Button + item(s): inline when space, menu items when collapsed.
  - Button only: inline when space, hidden when collapsed (`visible="always"` pins it inline).
  - Item(s) only: menu-only.
- Extensions continue to gate on `useSlot() === 'composer'` exactly as today; only the JSX they
  render inside that gate changes.
- Home: the primitives live with the widget UI kit surface (`packages/ui-kit-chat` or
  `apps/conciv` + re-export via `@conciv/extension`); final placement decided at implementation by
  where `TooltipIconButton`/`Menu` dependencies resolve without cycles.

### 2. Host coordinator (invisible to extensions)

**Ownership requirement:** the coordinator context AND the shared Ark `Menu.Root` must be
_logical Solid ancestors_ (owner-tree, not merely DOM ancestors) of everything that renders
`ComposerActions.*` — the built-in actions and `<ExtensionSurface name="composer">`. Concretely:
`PaneComposer` hosts `ComposerActionsProvider` + `Menu.Root` above `props.children`. Solid
`Portal` preserves context, so extension `Menu.Item`s portaled into the shared `Menu.Content`
node resolve Ark context correctly. Items that register before the content mount node exists
(Suspense) queue and portal once it mounts.

**Registration:** each `Root` registers `{id, priority, visible, hasButton, itemCount, disabled}`
into a reactive store on mount, unregisters on cleanup. Duplicate id: dev warning, last wins.
`Root` outside a coordinator renders nothing.

**Fit algorithm (pure arithmetic, no DOM measurement of candidates):**

- Action buttons are uniform `TooltipIconButton` geometry, so per-slot width is a design-token
  CONSTANT (`SLOT` = button width + gap) — candidate widths are never read from the DOM.
- Two passive `ResizeObserver`s (reuse `useSizeHandle`): one on the stable outer toolbar row, one
  on the trailing non-collapsible cluster (attachment control, model selector, send/cancel —
  model selector is the only variable-width occupant). Observers report already-computed
  geometry; no forced layout reads.
- `visibleAutoCount = floor((rowWidth − trailingWidth − reservedTriggerWidth − pinnedCount·SLOT) / SLOT)`
  — one subtraction and a division per resize event.
- The overflow-trigger width is ALWAYS reserved, removing the circular collapse condition
  (trigger appearing forces another collapse).
- Fill: pinned (`visible="always"`) buttons always inline, then the top `visibleAutoCount` `auto`
  buttons in priority-desc order; the rest collapse. Below a hard minimum budget all `auto`
  buttons collapse.
- Hysteresis margin on the count boundary so drag-resizing across a threshold cannot flap
  (visual stability; the arithmetic itself is negligible).
- Visibility changes never alter the observed row/cluster widths (buttons collapse into the
  portaled menu, the reserved trigger slot is constant), so no observer feedback loop exists.
- Overflow trigger button: accessible name "More composer actions", rendered only when ≥1 item is
  collapsed (space stays reserved regardless). Menu ordering: priority desc, then registration
  order.

### 3. Built-ins migrate to the same primitives

`apps/conciv/src/composer/actions.tsx` (grab, new session, compact, launch menu) is rewritten on
`ComposerActions.*`:

- Grab: `visible="always"` (primary, pinned) by default.
- New session, compact: `auto`, button + one dropdown item each.
- Launch: one `Root`; inline rendering keeps its own trigger + nested menu exactly as today;
  collapsed rendering = its conditional item set (open-in-harness / copy-command / retry)
  flattened into the shared overflow menu via multiple `DropdownItem`s.

**Full migration surface (all authoring/guidance call sites):**

- `packages/extensions/whiteboard/src/client.tsx`, `packages/extensions/tanstack/src/client.tsx`.
- `packages/extension/src/catalog.ts`: `composer-action` scaffold template, the `full` scaffold's
  raw composer button, slot descriptions ("add buttons or actions"), and scaffold assertions in
  `packages/extension/test/catalog.test.ts`.
- `packages/harness/plugins/claude/skills/conciv-extensions/SKILL.md` (teaches raw buttons today).
- `apps/site/content/docs/extending/widget-ui.mdx`.

No authoring surface may keep demonstrating raw composer buttons — anything unmanaged bypasses
collapse.

### 4. Refresh extracted from the composer

- Delete `ComposerPrimitive.Refresh` (`packages/ui-kit-chat/src/primitives/composer/composer.tsx`)
  and `onRefresh` from the composer handlers contract
  (`packages/ui-kit-chat/src/primitives/composer/composer-handlers.tsx`); the composer no longer
  knows refresh exists.
- New standalone self-contained `RefreshButton` in `apps/conciv`: internally calls
  `useChatContext()`, runs `chat.refresh()` (stream re-subscribe), disabled while streaming.
  Usable anywhere under a `ChatProvider`.
- Per-surface placement (`ChatProvider` stays where it is, inside `ChatPane`):
  - **Panel:** header right cluster (`apps/conciv/src/routes/panel.$sessionId.tsx`). The header
    renders above `ChatProvider`, so `ChatPane` relays a refresh command through `PaneContext`
    (same pattern as the existing `newSession`); the header button consumes `pane.refresh`.
  - **Quick mode:** per-pane placement (multiple sessions under one global header — a global
    button has no target). Each pane's own chrome row hosts `RefreshButton` directly.
  - **PiP:** no header exists; `RefreshButton` in pip chrome within the `ChatPane` region.
- ui-kit-chat's primitive-specific refresh browser tests are DELETED (not rewired — the header
  button is an app component; ui-kit cannot depend on it). Refresh behavior + streaming-disable
  coverage lives in the app-level browser suite.

## Error handling

- Duplicate `Root` id: dev-time warning, last registration wins.
- `Root` rendered outside a coordinator (e.g. non-composer slot): renders nothing.
- Zero collapsed items: no overflow trigger in the DOM (reserved space remains in the budget).
- Items registering before the shared menu content node mounts (Suspense): queued, portal on mount.

## Testing

Real-browser (Playwright/Chromium) tests against the prebuilt embed bundle, per repo rules:

- Narrow panel: `auto` buttons leave the row, "More composer actions" trigger appears, menu items
  present and fire the same actions; `visible="always"` button stays inline.
- Wide panel: all buttons inline, no trigger.
- Repeated resize across the exact threshold (drag back and forth): no oscillation, no
  ResizeObserver loop errors.
- Button-only Root hidden when collapsed; item-only Root appears only in the menu; multi-item Root
  (launch) shows its conditional set flattened.
- Disabled Root: inline button disabled AND menu item non-invocable, skipped by keyboard nav.
- Overflow menu keyboard lifecycle: `aria-haspopup`/expanded on trigger, arrow navigation,
  typeahead, Escape dismissal, focus return to trigger, menu closes after selection, focus
  behavior when a resize moves the focused action inline or unmounts an open menu.
- Extension-testkit: host runtime (`packages/extension-testkit/src/host/host-runtime.tsx`) gains
  the coordinator + shared menu root + configurable width so fixtures can exercise the primitives;
  fixture covering an extension using Button + DropdownItems.
- Refresh: re-subscribe + disabled-while-streaming tests move to the app-level suite against the
  panel header button; per-surface presence checks for quick/pip.
- Assertions role/visibility-based; panel width driven through real resize affordances; no DOM
  measurement assertions.

## Open items (implementation-time)

- Exact package placement of the primitives (dependency-cycle check).
- `ComposerActions.Button` needs an `asChild`-style escape for launch's inline rendering (the
  inline control is itself a menu trigger, not a plain onClick button); follow the existing
  `TooltipIconButtonSlot` + `Menu.Trigger asChild` pattern from `launch-menu.tsx`.
