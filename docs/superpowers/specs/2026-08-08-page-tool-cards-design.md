# Tool cards for page and extension tools

Date: 2026-08-08
Status: design approved, plan not yet written

## Problem

Every `page.*` tool call renders as the generic fallback: a header reading `Tool: page.fill` and a raw
JSON dump of the input and result. The user cannot see which element the agent touched.

This is a regression, and its cause is a name mismatch:

- `packages/ui-kit-chat-tools/src/styled/page-action-card.tsx` ends with
  `export const pageActionTool: ToolCardEntry = {names: ['conciv_page'], render: PageActionCard}`.
- PR #284 replaced the single verb-bag tool with one tool per verb:
  `packages/extensions/page/src/shared/defs.ts:56` builds `name: \`page.${spec.verb}\``, 37 verbs.
- `ToolCallCard` matches with `entry.names.includes(props.part.name)`
  (`packages/ui-kit-chat/src/styled/tools/tool-call-card.tsx`). `conciv_page` never appears again, so
  no entry matches and `ToolFallback` renders.

`PageActionCard` is unreachable code. It also parses an input shape that no longer exists: it reads
`input.verb` from a field-bag, and the per-verb schemas are flat.

Collateral damage: `ToolCallCard` renders `PermissionCard` inside `<Show when={matched()}>`, so
unmatched page tools also lose their inline approval card.

The same hole is open for every extension that ships tools. Nothing outside `builtinToolCards` — a
hardcoded array in a UI package — can render as anything but JSON.

## Non-goals

- Rasterizing elements to PNG. Measured and rejected; see Alternatives.
- A dependency on the recorder extension. Element capture must work whether or not a recording runs.
- Server-side rendering of element previews. No headless browser in the card path.
- Changing what page tools return to the model. Card data is UI-only.

## Design

### 1. Three-layer card dispatch

`ToolCallCard` keeps matching on `part.name`. Resolution order, first match wins:

1. **Extension-supplied card.** `tool.render(Card)` on the tool definition. The mechanism already
   exists and is wired end to end — `ToolBuilder.render` (`packages/extension/src/define-tool.ts:95`)
   stores `__render`, `collectToolRenderers` (`packages/extension/src/collect-client.ts:44`) harvests
   it, and `apps/conciv/src/pane/chat-pane.tsx:180` already merges the result ahead of
   `builtinToolCards`. No tool in the repo calls `.render()` today. `catalog.test.ts:47` asserts
   `__render` never reaches the server catalog, so renderers stay client-only.
2. **`builtinToolCards`.** Unchanged, for harness tools (Bash, Edit, Read, …).
3. **Meta-driven generic card.** Replaces the raw-JSON `ToolFallback` for any tool declaring `meta`.
   It must consume _every_ field a tool declares — a tool that fills in its meta properly should need
   no custom card at all. `ToolFallback` survives only for tools with no meta (foreign harness tools
   with no definition of ours).

   Field-by-field mapping, all of it already declared at the definition site:

   | declared field                 | rendered as                                                                        |
   | ------------------------------ | ---------------------------------------------------------------------------------- |
   | `label.running` / `label.done` | card title, switched on `part.state`                                               |
   | `summary`                      | subtitle, and the tooltip on the title                                             |
   | `icon`                         | leading icon via `toolIconRender`                                                  |
   | `positional`                   | the headline argument, promoted next to the title (`page.click ⟨#submit⟩`)         |
   | remaining input fields         | key/value chips ordered required-first, via the existing `schemaParams`            |
   | `mutating`                     | write-badge; drives whether an element capture is taken                            |
   | `mirrors`                      | the "shown on your page" affordance                                                |
   | `category`                     | accent color grouping (`read` / `act` / `edit-live` / `react`)                     |
   | `hint`                         | collapsed help line under the summary                                              |
   | `errors`                       | a failed call renders the declared message for its code, not a raw string          |
   | `outputSchema`                 | picks the result view: scalar → chip, array of objects → list, string → code block |
   | `approval: 'ask'`              | approval affordance, alongside `PermissionCard`                                    |

   **This requires widening the wire.** `ToolViewMeta` (`packages/protocol/src/tool-view-types.ts:7`)
   currently carries only `summary, icon, label, mutating, mirrors`; `category`, `positional`,
   `hint`, and `keywords` are declared on `ToolMeta` but dropped when the catalog is built
   (`packages/extension/src/tool-registry.ts:451`). Widen `ToolViewMeta` to the full `ToolMeta` set
   and pass `inputSchema` / `outputSchema` / `errors` through the catalog. `keywords` stays
   model-facing only (search, not display).

`pageActionTool` and `PageActionCard` are deleted. Their result-shape views — the a11y node list, the
HTML block, the value chip — move into the page cards that need them.

Because layer 3 always matches a tool with meta, `PermissionCard` renders again for page tools.

### 1b. A card ships from the package that defines its tool

Hard rule. `ui-kit-chat-tools` provides the vocabulary to _build_ cards; it does not host cards for
tools someone else owns. Current ownership:

| card                                                                                                            | tool defined in                                   | ships from                                          |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| the 37 `page.*` verbs                                                                                           | `packages/extensions/page/src/shared/defs.ts`     | the page extension, via `.render()`                 |
| `conciv_ui`, `conciv_extensions`, `conciv_open`                                                                 | `packages/tools/src/{ui,extensions-tool,open}.ts` | `packages/tools`                                    |
| `execute_typescript`                                                                                            | `packages/core/src/api/mcp.ts`                    | `packages/core`                                     |
| Bash, apply_patch, Read, Edit, MultiEdit, Write, Grep, Glob, TodoWrite, ToolSearch, `__lazy__tool__discovery__` | nobody — foreign harness tools                    | `ui-kit-chat-tools` (the only legitimate residents) |

`packages/tools` and `packages/core` are node-side today and need a browser export condition plus a
vite client build to ship Solid cards. Copy the recorder extension's packaging exactly — it already
ships Solid UI from an extension (`@conciv/ui-kit-chat` + `lucide-solid` deps, `solid-js` peer,
`panel-view.tsx` / `recording-card.tsx`, dual tsdown + vite build). The page extension has no `.tsx`
and no vite build yet; it gains both.

Widget bundling rules apply unchanged: every `@conciv/extension/*` subpath and the shared Solid/Ark
deps stay externalized, or a second Solid copy splits the context. `rrweb-snapshot` becomes a direct
dependency of the page extension — it must resolve to one copy shared with the recorder, not two.

### 2. Element capture

Cards must show the element **as it was when the tool ran**. Re-locating it at render time is not
possible: `ref` values reset on every snapshot, and the DOM has usually moved on.

Capture happens client-side, inside the page verb, at execute time:

```text
node        serializeNodeWithId(el, {...}) from rrweb-snapshot
            + ancestor skeleton: each ancestor serialized with skipChild: true,
              chained as the single child path down to the target
            + data-rr-target marker on the target node's attributes
descriptor  role, accessible name, value/checked state, rect,
            selectorPath, componentName + file:line where resolvable
cssBundleId hash of the page's collected stylesheet text; the bundle is stored
            once per (page, hash) and shared by every capture
```

The ancestor skeleton is load-bearing. Page CSS is written in terms of context
(`.page input[type=text]`, `.page .cta`); an element serialized alone matches none of those selectors
and inherits nothing, so it replays with browser-default styling. Serializing the ancestor chain —
tags, classes, attributes, siblings omitted — restores both descendant-selector matching and
inheritance.

Replay: rebuild into a shadow root, inject the CSS bundle, apply one composed
`scale(s) translate(-x, -y)` to crop to the target's box, measured after `document.fonts.ready`. The
subtree is `inert` with `pointer-events: none`; no script ever runs.

Masking is rrweb's, at serialize time: `maskInputOptions: {password: true}` means the real value never
leaves the page. Widen to `autocomplete`-tagged payment and one-time-code fields.

Measured on a representative form (see Alternatives for the comparison):

|                        | per call (gzip)      | capture time |
| ---------------------- | -------------------- | ------------ |
| rrweb node + ancestors | 171–238 B            | 0–2.8 ms     |
| page CSS bundle        | 857 B, once per page | —            |

Twenty page actions cost roughly 4 KB.

### 3. Storage: UI-only artifacts

Nothing in a tool's return value can hold this data — tool results become model context, and
`imageResult` (`packages/extension/src/image-result.ts`) exists precisely to send content _to_ the
model. Element captures must never enter the prompt.

Add a table keyed by tool call:

```text
toolArtifacts(toolCallId PK, sessionId, kind, payload JSON, createdAt)
cssBundles(hash PK, sessionId, css TEXT, createdAt)
```

Written by the client alongside the tool response, streamed to the widget with the transcript, never
folded into a message. Deleted with the session.

### 4. Card vocabulary

37 verbs, six families. One card component per family, parameterized by meta — not 37 bespoke cards.

| family         | verbs                                                                                             | card shows                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| act (10)       | click, hover, press, check, uncheck, fill, select, submit, scroll, wait                           | frozen element preview + verb-specific detail (typed value, chosen option, key)                                |
| edit-live (11) | settext, sethtml, setattr, removeattr, addclass, removeclass, setstyle, insert, remove, css, eval | before/after element preview where both sides exist; diff for text/attr/class; code block for `eval` and `css` |
| read-value (5) | text, value, attr, exists, route                                                                  | element chip + the value as a chip; no preview needed                                                          |
| read-bulk (3)  | dom, query, snapshot                                                                              | existing views salvaged from `PageActionCard` — formatted HTML block, a11y node list                           |
| react (6)      | locate, inspect, tree, find, override, track                                                      | component name + source `file:line`, props/state tree, re-render counts                                        |
| console (1)    | console                                                                                           | log lines, error styling                                                                                       |
| effect (1)     | effect                                                                                            | which effect, on/off, mirrored-to-page indicator                                                               |

Capture is opt-in per verb. `act` and `edit-live` capture; read verbs do not, except where the element
identity is the point.

`meta.mirrors` keeps driving the "shown on your page" affordance. When a recording is live, the card
additionally stamps `{recordingId, ts}` and offers a jump into the replay panel — the serialization
format is identical, so a captured element and a recording keyframe are the same type, and
`server/node-index.ts` labelling works on both.

## Alternatives considered

All four were built and measured in a scratchpad spike against the same form.

| approach                                        | per call (gzip) | capture      | replay needs                    |
| ----------------------------------------------- | --------------- | ------------ | ------------------------------- |
| snapdom PNG @2x                                 | 5–8 KB          | 9–30 ms      | nothing                         |
| snapdom SVG                                     | ~4.8 KB floor   | 1–2 ms       | nothing                         |
| hand-rolled clone + whitelisted computed styles | ~530 B          | 0.1 ms       | shadow root                     |
| **rrweb node + ancestor skeleton**              | **171–238 B**   | **0–2.8 ms** | shadow root + shared CSS bundle |

- **snapdom** (`@zumer/snapdom`, 49 KB gzip) works and is fast, but stores pixels: 10× the bytes, and
  its SVG output carries a ~4.7 KB floor even for a 13×13 checkbox. System fonts fall back (no
  `@font-face` to inline) and UA-drawn control chrome is lost — a `<select>` arrow came out as a
  literal `v`. Keep in reserve for a future "capture this region as an image" verb, where inlining
  everything is the actual requirement.
- **satori** — renders JSX to SVG. No DOM, no cascade, needs font files supplied. Cannot capture a
  live element. Rejected.
- **takumi** — Rust/WASM, HTML/JSX/node-tree to image, runs in Node, Workers and the browser. Also
  cannot capture. Interesting later as a renderer of a stored recipe for off-browser surfaces
  (transcript export, iOS, digests); costs a multi-MB WASM blob, so not now.
- **Live pointer instead of frozen capture** — hover the chip, highlight the element on the page.
  Nearly free, but wrong the moment the page changes and useless on transcript reload.

rrweb wins on every axis and is already a dependency (`rrweb-snapshot@2.1.0`, via
`@conciv/extension-recorder`).

## Risks

- **Cross-origin stylesheets** throw on `cssRules` and are skipped silently, so a page whose CSS is
  CDN-hosted without CORS replays unstyled. rrweb's recorder has the same constraint and handles it
  via `onStylesheetLoad`; reuse that path and degrade to the descriptor-only card when the bundle is
  incomplete.
- **CSS bundle growth** on large sites. Hash-dedupe per page, cap the stored size, fall back to
  descriptor-only past the cap.
- **Shadow DOM and canvas** in the captured subtree are untested here. rrweb records both in its
  recorder path; confirm the element-level path before relying on it.
- **Widget-in-page recursion** — never capture a subtree containing the widget itself.

## Testing

- Widget integration tests in a real browser against the prebuilt bundle: capture an element, mutate
  the page (theme flip, delete the node), assert the card still shows the original state. This is the
  behavior the spike proved and the one most likely to regress.
- Assert a password input's real value appears in neither the artifact payload nor the tool result.
- Assert the artifact payload never appears in the message stream sent to the harness.
- One story per card family in the ui-kit-chat-tools storybook, fed by fixture captures.
- A dispatch test per layer: extension card wins over builtin, builtin over meta-driven, meta-driven
  over `ToolFallback`.

## Resolved decisions

- **The meta-driven card lives in `ui-kit-chat`**, next to the `ToolFallback` it replaces. It renders
  from meta and schemas alone and never names a concrete tool, so it does not violate the
  thin/tool-agnostic rule. `ui-kit-chat-tools` keeps the concrete vocabulary it is built from.
- **Cards ship from the package that defines the tool** (§1b). Page cards move into
  `packages/extensions/page` via `.render()`; `conciv_ui` / `conciv_extensions` / `conciv_open` move
  into `packages/tools`; `execute_typescript` into `packages/core`. Only foreign harness tools —
  which no package of ours defines — keep their cards in `ui-kit-chat-tools`.
- **The default card consumes every declared field**, which requires widening `ToolViewMeta` to the
  full `ToolMeta` set and passing schemas and errors through the catalog (§1, layer 3).

## Follow-up, out of scope here

`packages/tools` hosting Solid cards is the mechanical consequence of the colocation rule, but those
built-ins (`conciv_ui`, `conciv_open`, `conciv_extensions`) are extension-shaped and would be cleaner
as real extensions. File that as its own piece of work rather than smuggling it into this one.
