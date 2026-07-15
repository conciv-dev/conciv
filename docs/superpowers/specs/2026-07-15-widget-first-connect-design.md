# Widget-first connect UX

Date: 2026-07-15
Status: approved design, pre-plan

## Problem

The live "connect your agent" demo is hidden behind a small outline button in the hero
(`apps/site/src/components/landing/connect-live.tsx`). The copy-paste pairing UI renders as a card
inside hero content. Discovery is poor and the flow feels like a sidebar, not the product.

## Goal

The page opens with a widget-shaped panel already open (bottom-right), inviting the visitor to
connect their agent from inside it. When the agent connects, the same spot becomes the real live
widget with its panel open. The demo IS the widget from the first frame.

## Constraints

- Core, embed, app, and try packages stay untouched. The stand-in is entirely `apps/site`.
- Site state rides the URL (TanStack Start search params), not component state.
- Motion follows the design rules in the Motion section; settled states stay still.

## Components (all in `apps/site`)

- **`TryPanel`** (new; replaces the `ConnectLive` card): fixed bottom-right panel matching the real
  widget panel's footprint and offsets (real widget: `w-120 h-140 max-w-[calc(100vw-2.5rem)]
  max-h-[calc(100vh-7.5rem)]`, `bottom-21 right-5`, origin bottom-right — see
  `apps/conciv/src/routes/panel.tsx`). Content is a chat-style empty state:
  - one-line pitch
  - copy row: `Read https://conciv.dev/pair/<token> and follow the instructions`
  - copy row: `npx @conciv/try --token <token>`
  - pulsing "waiting for your agent…" line + Chrome local-network permission hint
  - privacy line (everything stays on your machine)
  - after ~60s with no connection: soft hint line linking to docs quickstart (no hard timeout)
  Styled with the site's design system; same footprint/position as the widget, not a pixel clone.
- **`TryLauncher`** (new): bubble at the widget FAB position, shown when the panel is closed.
  Reuses the `RobotFab` mascot rig (`@conciv/mascot`) as the face. Click reopens the panel.
- **Hero**: copy-paste UI removed. A small "Try it live" button remains that only opens the panel.
  Hidden when a real/dev widget is on the page.
- **`lib/connect-live.ts`**: gains `seedOpenPanel(base)` (see Handoff). `findCore`, `mountWidget`,
  `CONNECT_PORTS` unchanged.
- `ConnectLive` and its phase UI are deleted.

## State & URL

- Panel open/closed = search param on the index route (`?try=1`). `conciv.dev/?try=1` is a
  shareable link that opens the page with the panel open.
- First visit (no param, no dismissal flag) → replace-navigate to add `?try=1` (auto-open once).
- Close → localStorage dismissal flag + param removed. Later visits show only the launcher.
- An explicit `?try=1` in the URL always opens the panel, dismissal flag or not — the flag only
  suppresses the automatic first-visit navigation.
- Token: generated per page load (`crypto.randomUUID()`) when the panel first opens. The
  `findCore` poll loop (2s interval over `CONNECT_PORTS`) runs while a token exists, even if the
  panel is re-closed — the agent may connect while the panel is shut; the widget still mounts.
- If `[data-conciv-root]` exists (dev widget), stand-in, launcher, and auto-open all skip.

## Handoff (connect flow)

1. Poll loop finds a healthy core at `http://127.0.0.1:<port>/t/<token>`.
2. **Seed** (`seedOpenPanel(base)`): `POST sessions.resolve {}` → `sessionId`, then
   `POST navigation.set` with `{entries: [{href: '/panel/<sessionId>?open=true'}], index: 0}` —
   matches `NavigationStateSchema` (`packages/protocol/src/chat-types.ts:81`); `state` is optional
   and `createWebStorageHistory` synthesizes it for stateless entries.
3. **Mount**: `mountWidget(base)` unchanged. The widget boots, restores the seeded history, and
   opens directly on `/panel/<sessionId>?open=true`.
4. **Transition**: stand-in shows a brief "connected — going live" state (~600ms: pulse dot goes
   solid, blur-crossfade), then unmounts. The real widget's own pop-in covers its entry. If the
   panel was closed at connect time: no theatrics — launcher unmounts, the widget FAB takes over.
5. The stand-in's health watching ends at mount; the real widget owns connection state from then
   on. The stand-in never returns within the page load; reload restarts the flow.

Seed failure (network blip, schema drift): mount anyway — the widget boots closed, which is the
pre-existing behavior. Console-log the error; nothing user-facing.

## Motion

Personality: professional tool with a playful mascot accent — crisp and fast, one deliberate
showpiece (the handoff). Rules: transitions not keyframes (interruptibility), transform+opacity
only, exits faster than entries, no animation on keyboard-triggered actions, hover effects gated
behind `@media (hover: hover) and (pointer: fine)`, settled states motionless.

| Moment | Motion | Values |
| --- | --- | --- |
| Auto-open on load | opacity 0→1, `translateY(8px) scale(0.97)`→none, origin bottom-right (mirrors the real widget's pop-in) | ~220ms, `cubic-bezier(0.23,1,0.32,1)` |
| Close → launcher | reverse of entry, then launcher pops in at `scale(0.95)`+opacity | exit ~160ms, bubble ~180ms |
| Reopen | same entry, no stagger (repeated action) | ~200ms |
| Empty-state content | one-time stagger on first open only (pitch → rows → waiting line) | 40ms steps, ease-out |
| Waiting | single pulsing dot; nothing else moves | — |
| Handoff | pulse → solid dot, blur-crossfade (`blur(2px)` + opacity) masking the swap; widget pop-in lands | ~600ms, ease-in-out |
| Buttons/copy rows | `scale(0.97)` on `:active` | 140ms |
| Reduced motion | opacity-only, stagger dropped | — |

Implementation tasks must load `emil-design-eng`, `impeccable:animate`, and `frontend-design`
during build, and finish with an `impeccable:polish` pass.

## Edge cases

- Multiple tabs: one token per tab, first core found wins per tab (unchanged from today).
- Small viewports: panel goes full-width bottom-sheet within the real widget's max-w/max-h
  constraints; auto-open stays on.
- No agent: panel waits indefinitely (soft docs hint after ~60s).

## Testing

- **Unit (vitest, node):** seed payload builder validated against `NavigationStateSchema`;
  auto-open/dismissal decision logic.
- **IT (Playwright, real browser):** extend `apps/site/test/live-connect.it.test.ts` — stand-in
  auto-opens on load; seed calls hit a fake core in order (sessions.resolve → navigation.set);
  real prebuilt widget bundle mounts with the panel open against the existing e2e core; stand-in
  is gone after handoff. `domcontentloaded` waits only; `browser.newPage()`.
- `pair-route` / `source-manifest` tests untouched.

## Out of scope

- Any change to core/embed/app/try packages.
- Scripted demo conversations or fake chat.
- Mobile-specific pairing flow beyond the responsive bottom sheet.
