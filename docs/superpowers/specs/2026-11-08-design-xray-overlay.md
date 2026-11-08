# Design x-ray: an overlay on the app (2026-11-08)

Status: draft, groomed from the brainstorm and the HTML mockup (`xray-mockup.html`, artifact v5). Not ruled yet.
Lives beside `2026-11-06-design-three-tools.md`; moves into `docs/superpowers/specs/` with the wave that builds it.

## What it is for

A person opens the page their agent is building and sees, on the page itself, what the design extension sees: every
conciv id as a box, the rows of the last round drawn where they apply, and for any box the four layers the database
holds for it (FOM, DOM, CSSOM, SRC). The side pane we have today lists rounds and images; it does not point at the
page. The overlay points.

Not a second measurement. Everything shown comes from the same store the agent queries: `targets.ids` (the id tree
with its dom, cssom, src and fom layers), `design_nodes`, `design_rounds` and the rows table, the mapping. The
overlay reads, never computes a verdict.

## The host

- One element, `[data-conciv-overlay]`, appended to `document.body`, shadow root, `position: absolute; inset: 0;
  pointer-events: none`, above the page and below the chat widget. Boxes inside it are positioned from the page's
  layout, so it scrolls with the page and never reflows it.
- Off is `hidden` on that one element; the measurer, snapdom, region capture and the agent's own screenshots exclude
  it with one selector, the same `designConfig.attributes` entry the pane uses today (`pane` becomes `overlay`; one
  attribute, one selector, everywhere the pane is excluded now).
- The toolbar and the card are children of the host. Nothing of the overlay lives outside it.
- Clicks reach the page unless `pick` is on; then only the boxes take pointer events. No pointer capture, ever.
- The overlay ships no stylesheet of its own (ruling, 2026-11-08). The widget's Uno scan covers the design extension's
  sources, the widget root adopts its styles as one `CSSStyleSheet` built once per document, and `HostWiring.styles()`
  returns that sheet; the overlay's shadow root sets `adoptedStyleSheets` to `host.styles()`. The six `--xray-*` hues
  are inline custom properties on the overlay host element (`style.setProperty`), derived from `--chat-*`;
  `view-transition-name` is set inline per box. Nothing in the design package produces CSS, so the "extension's own
  stylesheet" in Look and motion below means those inline properties.

## Layers (toggles, all drawn from stored data, none measured live)

| layer   | box source                                                                                          | drawn as                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| DOM     | the id's `dom[].box` at the round's width                                                           | thin outline, one per instance                                                             |
| FOM     | the paired Figma node's box from `design_nodes` at the round's width (scaled by the target's scale) | dashed outline, offset shows the delta                                                     |
| changed | the round's pixel regions (the twelve largest, already stored)                                      | filled, faint                                                                              |
| rows    | every row of the round, by magnitude, on its node's box                                             | colour per magnitude; a `paint` row colours the box edge; a `reflow` row only at its width |

A box with no row and a pair is `matched`; off by default. The row filter buttons are magnitude toggles: much,
noticeably, slightly, reflow, paint, matched. The three layer buttons are DOM, FOM, changed.

Box positions come from the measured DOM box of the round, not from `getBoundingClientRect` at view time: a person can
look at round 3 while the page is at round 6. When the shown round is the last one and the page has not changed since
(`unsettled` is 0), the boxes line up with the page; otherwise the overlay says "round 3 of 6, page has moved" in the
toolbar and the boxes stay where round 3 measured them.

## The toolbar

Top of the host, one row, wraps on narrow pages. Groups: `x-ray on | pick | 3D`, layers, rows, width, round.

- `width` steps through the widths the round measured (the design width and every reflow width). Changing it does
  not resize the page; it switches which stored boxes and rows are drawn and shows the width in the output.
- `round` steps through the stored rounds, last by default. Polls the store every 2 s like the pane does; a new round
  moves the slider to it only when the slider was already at the last one.
- `pick` turns on box hit-testing; hovering a box tints it; clicking opens the card. Esc closes the card, then turns
  pick off, then turns the overlay off.
- Capture button (the share prompt for region capture) sits in the content column's header, beside close.

## The card

One `aside`, `aria-live=polite`, docked to the side the chat widget is not on. Four sections for the picked id, in
this order and these words:

- **FOM**: Figma node id and name, box, and the look fields from `design_nodes`: fill, text color, font family,
  weight, size, line height, radius, border, opacity, asset; each with its token name when bound.
- **DOM**: element path, the measured box, text, drawn, kids; one block per instance.
- **CSSOM**: the stored computed styles for the instance; a field whose row is wrong shows expected beside found,
  same words as the row.
- **SRC**: file:line and the element and classes, as a link that opens the editor (the same link the pane's rows will
  carry).

Below the four: the rows of this id in this round, and the accept / mark buttons the pane has (they keep writing the
labels they write today).

## 3D

`3D` lays the layers out as planes in perspective, page-sized, one behind the other: SRC, CSSOM, DOM, FOM, with the
page itself at the DOM plane (a live clone of the page root, `inert`, no scripts) and the Figma render (`target`
image) at the FOM plane. Row lines connect a DOM box to its FOM box across the gap when the magnitude filter shows
them. Click a plane to bring it to the front at 1:1; Esc returns to the stack. Unfocused planes are not translucent:
they are either shown in the stack or `display: none` in focus. Drag on empty space orbits; the sliders keep working.

No React Flow and no graph in this version. A connections view (which rows share a token, which ids share a key) is a
later spec, after the thesis.

## Data the overlay needs that the store does not serve today

- `xray.rounds` returns rows, reflow results, counts; it does not return the per-id boxes of that round. Add
  `xray.layers({id, round, width})` returning, per conciv id, the dom boxes, the fom box, the src location and the
  cssom fields at that width, from `targets.ids` and `design_nodes`. The id tree already holds all four layers; this
  is a projection, not a new table.
- The twelve pixel regions per round are stored (progress wave); expose them on the round.
- Nothing else. If a field is missing from the store, the overlay shows "not stored" rather than measuring.

## Hotkeys

Nothing in the extension host registers a key today; the host binds its quick terminal with `createHotkey` from
`@tanstack/solid-hotkeys` (`apps/conciv/src/routes/__root.tsx`) and the in-app highlight extension calls
`createKeyHold` on its own. The overlay does not copy that: the host gets the member first.

- `HostWiring` gains `hotkeys`: `register({binding, handler, label})`, a thin wrap of `createHotkey` with
  `parseHotkey` from `@tanstack/hotkeys`. The host refuses a binding the quick terminal or another extension already
  holds (an error naming both), and its settings view lists every registered binding with its label and extension.
  One commit in the host, its own test.
- The design extension registers two: overlay on and off, and pick on and off. The bindings live in the extension
  config, `hotkeys: {overlay: 'Mod+Shift+X', pick: 'Mod+Shift+P'}` by default, and the rail buttons show them in
  their tooltips.
- Esc never goes through the registry; it is the overlay's own cascade: card, then pick, then overlay off.

## Look and motion

The shape is devframe's edge dock (`DockEdge.vue`, `DockGroupSidebar.vue`): a glass panel on the left edge, an icon
rail, a content column beside it, hairline dividers, icons at rest dimmed and lit on hover, the active one tinted with
the accent. Every value comes from `@conciv/ui-kit-system` tokens; the overlay declares no pixel of its own.

| devframe value                                  | ours                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| glass surface, blur                             | `--chat-glass`                                  |
| `border-base` `#9992`                           | `--chat-line` (dividers `--chat-line-soft`)     |
| `bg-hover` `#99999915`, `bg-active` `#99999920` | `--chat-fill`, `--chat-fill-strong`             |
| `text-primary` on the active button             | `--chat-accent`                                 |
| rest opacity 0.6, `op-fade` 0.65                | `--chat-dim` for the icon colour, no opacity    |
| rail 48, button 32, icon 20, gap 2, padding 6   | multiples of `--chat-space`: 12, 8, 5, 0.5, 1.5 |
| `rounded-lg` button, `rounded` chip             | `--chat-radius-md`, `--chat-radius-sm`          |
| 15px base, mono for ids                         | `--chat-font`, `--chat-mono`                    |
| 300 ms `cubic-bezier(0.16, 1, 0.3, 1)`          | `--chat-ease-expo`                              |

Icons are the kit's Phosphor set (`i-ph-*`), the same the pane uses now. Row and layer colours (much, noticeably,
slightly, reflow, paint, matched, DOM, FOM) are the one place the overlay adds colour: six hues declared once in the
extension's own stylesheet as `--xray-*`, derived from kit tokens where one fits (`--chat-danger` for much,
`--chat-warn` for noticeably, `--chat-success` for matched, `--chat-accent` for the pick ring).

Motion is the View Transitions API, nothing hand-animated:

- Every mode change runs inside `document.startViewTransition`: overlay on and off, card open and close, flat to 3D
  and back, plane focus and back, round change, width change.
- Each box carries `view-transition-name: box-<conciv id>` so a box morphs from its round 3 place to its round 4
  place, and from the flat view to its plane in 3D, instead of blinking.
- The rail and the card carry names too, so the content column slides rather than pops.
- The browser without the API, and `prefers-reduced-motion`, get the plain state swap. No fallback animation.

## What stays out

- No editing from the overlay beyond accept / mark.
- No live measuring, no second pairing, no verdict.
- No per-user settings; toggles persist in `localStorage` under one key, nothing else.
- No React Flow, no graph, no history scrubbing across sessions.

## Open before the wave

1. Closed: the card is the content column of the left edge panel, beside the rail (mockup v8).
2. Closed: the pane folds into that column; one surface behind one button.
3. Widths with no stored boxes (a reflow width measured only for overflow and height): draw nothing, or draw the
   design-width boxes greyed. Mockup: nothing.
   Closed: this version stores boxes at the design width only. At another width the overlay draws the design-width
   boxes dimmed with one line "boxes measured at <design width>", and the reflow rows of that width on them.
4. Closed: the id tree is stored per round (`rounds.ids`, written in the transaction that writes the round), so
   `xray.layers({id, round})` answers for any stored round. A wave 14 database keeps opening: its `targets.ids`
   becomes the last round's.
5. Closed: the host has no settings view; `HostWiring.hotkeys.bindings()` is the list of registered bindings.

## Proof

Playwright over the design fixture host, one file: open the overlay on a session with three rounds, the box count
equals the id count of round 3's tree, the card for one id shows the four sections with the stored values, the width
slider changes the drawn boxes, 3D focus on FOM shows the target image, Esc backs out, and a snapdom of the page with
the overlay on equals one with it off (the exclusion holds). Vitest none.
