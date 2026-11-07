# Design extension: three tools over a stored mapping

Supersedes the tool surface of `2026-11-06-design-contract.md`. The stage interfaces, the one tree, the store and the
file rules of that contract stay. The four tools (`design_target`, `design_diff`, `design_status`, `design_watch`) and
everything that exists only for them (deltas, judge, words, report, items, text deltas, tiles, typography decisions,
css map) go. Three tools replace them, built from the recipe the journal proved on five designs (tag3: tagged JSON plus
rule sentences, one gate round, 0 much rows, $1 to $3) and from the mapping model Omri set on 2026-11-05.

## The model

- The live page has a key per element: the conciv key the dev server stamps at compile time. Every live measure
  carries it.
- The design is the Figma tree; every node has its Figma id.
- A **mapping** connects the two: `{figma: {fileKey, nodeId}, conciv: key}`, many-to-many, stored per target. It is
  written once per node, from the first source that knows it, and read after. Sources, in order of trust:
  1. declared: the element that renders the node says so (`data-figma="<nodeId>"` on the element; a stand-in for the
     agent declaring the mapping, kept until the product has its own declaration);
  2. stored: the mapping already holds the node;
  3. voted: the pairer proposes a key for a node no one declared and nobody stored.
     A stored entry is only replaced by a declaration. The vote never overrides a stored entry; it votes only for
     unmapped nodes, and a node whose key disappeared from the page reads as "not rendered", not as re-voted.
- Everything the tools say is said by mapping: a row names a Figma node and its conciv key.

## The three tools

### `design_get`

Input: `{figma: string}` (the frame link) or `{figma, document, image}` (link plus the pasted document and image, as
today's `design_target` takes them). Registers the target if new (id from fileKey, nodeId and document version), loads
the image for pixels, and returns the document the agent builds from. One shape, the tag3 tagged JSON, produced from the
one tree:

- `nodes[]`: `id, type, name, within, depth, box, fills, strokes, radius, text, font, layout, sizing, layoutAlign,
  constraints, clips, image, crop, absolute, implied, reflow, key` with the same meaning as `figma5/tagged-nodes.json`
  in the journal. `key` is the conciv key when the mapping holds the node, else absent.
- collapse: the rule of `dump/collapse-plugin.mjs` (vector-ish nodes and child trees without text or auto-layout
  collapse into one `image` node; an image fill marks `image`; a child larger than its parent marks `crop`).
- implied groups and layers: the structure pass of `xycut/brief-figma22.mjs` (a row or column the siblings imply
  becomes a `w:` group; an absolute-positioned overlay cluster becomes an `l:` layer; ids `w:<parent>;<n>` and
  `l:<parent>;<child>`), `implied: true`, children re-parented into them.
- reflow tags: the rule of `xycut/tag-reflow.mjs` (`reflow: {kind: 'stack' | 'wrap' | 'scroll', minChildWidth}`).
- `rules: string[]`: the sentences of the tag3 recipe, from `figma-loop/tag3-head.txt`: build from the tree, one
  element per id with `data-figma`, flow, flex and grid only, no absolute, no px width or height on containers or
  text, images as empty divs sized by aspect ratio, a WRAP row keeps one line at the design width; plus the
  `impliedFields` and `reflowFields` sentences the tagger writes.
- `root`, `count`, `viewport`.

The description of the tool is one paragraph; no schema text in it. The agent reads the rules from the output.

### `design_watch`

Input: `{}` or `{nodes?: string[]}`. Measures the page now (the existing Measurer over the widget), updates the mapping
(declared, stored, voted, in that order), and returns what to fix:

- `rows[]`: the gate rows, by mapping, from the rule of `com/com4.mjs` plus the magnitude words of
  `com/words2.mjs`: a container pinned with a px width or height; a text with a px size; a box narrower, wider,
  shorter or taller than the design; a flex-direction against the design; a box sitting further left, right, higher
  or lower inside its parent. Each row: `{node, key, kind, name, text, magnitude}` with magnitude `much` or
  `noticeably`. Rows at `slightly` are counted, not listed.
- `reflow`: at 1024 and 768 (the measurer takes a width; the page is measured at each): `sticksOut[]`, `overflowX`,
  `overlaps[]`, `tags[]` with `ok` and `why`, by the rule of `rightcss/reflow.mjs`.
- `coverage`: `{nodes, mapped, rendered, missing[], unknown[], dupes[]}`.
- `counts`: `{much, noticeably, slightly, pins, rows}`.
- `round`: the number of this measure since registration.

A measure of a broken page (page error, or under half the rendered count of the previous round) is answered with
`{unsettled: true, rendered}` and no row, writes no round and moves nothing.

### `design_validate`

Input: `{}`. Reads the last round, takes pixels against the design image (the existing raster compare, share of
mismatched pixels), and gives one verdict:

```
{verdict: 'done' | 'not yet' | 'stalled', reasons: string[], counts, coverage, reflow, pixels: {share}, rounds: number}
```

- `done`: `much + noticeably + pins = 0`, every required node rendered (zero-size nodes, collapsed children and
  decorations are not required), no `sticksOut`, no `overflowX`, every reflow tag `ok` at 1024 and 768.
- `stalled`: `much` has not fallen for two rounds in a row.
- `not yet`: otherwise; `reasons` says which condition failed, one sentence each with the numbers.

Pixels are reported, never judged (blank images and font substitution dominate the share).

## Store

Keys per target: `design` (the tree), `image`, `mapping` (`{figma, conciv, source: 'declared' | 'voted', round}[]`),
`rounds:<n>` (`{rows, reflow, coverage, counts, pixels, at}`), `live:<n>.png`. `Store` interface: `put`, `design`,
`image`, `mapping`, `writeMapping`, `writeRound`, `round`, `rounds`, `clear`. The in-memory page watcher stays as
the source of the latest measure for `design_watch`; nothing else is held in memory.

## What goes

Files: `deltas.ts`, `judge.ts`, `words.ts`, `report.ts`, `items.ts`, `text-deltas.ts`, `tiles.ts`, `typography.ts`,
`css-map.ts`, `brief.ts`, `projections.ts`, `provenance.ts`, `kinds.ts` if nothing else uses it. In `defs.ts`: the
four tool defs and their schemas, `DiffReport`, `Run`, `Ledger`, `Decision`, `Timings`, `Item`, stop and stage enums.
The x-ray panel and the overlay pane read the new rounds (rows, reflow, live and diff images) and nothing else; no
feature is added to them, and anything in them that only showed a deleted shape (decisions, typography overrides,
accept) goes with that shape. The trial (`pnpm trial`) gets commands `get`, `watch`, `validate`, `quit`.

## What stays

`defs.ts` as the one shared file; `Measurer`, `Pairer` (as the voter), `TargetAdapter` for Figma and image (the image
adapter feeds `design_get` with an OCR tree and no reflow tags), `Store` on unstorage, `Runner` as the one place that
measures, maps and writes a round, `DesignRuntime`. One export per file, no `node:fs` outside the store, files under
600 lines.

## Proof

The tool loop of `figma-loop/brief-tool-loop.md` with the prompt reduced to "call design_get, build what it returns
following its rules, then design_watch and fix rows until design_validate says done, at most 8 watches". Pass: on
OrangeFarm and Pricing, `done` reached, external gate 0 much (the harness gate stays as the independent score), cost at
or under tag3. Gates while building: typecheck, lint, build; no vitest in this phase.

## Rulings after the three-tools runs (2026-11-06)

The first runs reached `done` on OrangeFarm and Pricing while the pages were wrong in ways the tools did not see.
These rulings close those holes. They change `design_watch`, `design_validate` and the Figma adapter; nothing else.

### Measurement widths come from the design and the page, never from the tool

`1024` and `768` go. `design_watch` measures the page at a set of widths it derives per target:

1. the design width (the root node's width);
2. per reflow tag of kind `stack` or `wrap`: its breakpoint, the sum of the children's `minChildWidth` plus the
   gaps plus the parent's horizontal padding. Measure at the breakpoint and at one pixel under it;
3. every width named by a media or container query in the page's own stylesheets (the agent chose them; the tool
   checks them). Measure at each and at one pixel under it;
4. the floor: the narrowest `minChildWidth` of any leaf in the tree. No width under the floor is measured.

The set is deduplicated and sorted; the reply lists it as `reflow.widths`. Two designs get two different sets.

### The reflow check reads both directions

At each width, for each tagged row, by mapping:

- width at or above the row's breakpoint: the element must still lay out as the design does (flex-direction of
  the design, children on one line, no wrap). Stacked here is a row `stacked too early`, magnitude `much`.
- width under the breakpoint: the element must do what the tag says (`stack`: column; `wrap`: more than one line;
  `scroll`: horizontal overflow inside the element, none on the page). Not doing it is a row `did not <kind>`,
  magnitude `much`.

The break checks of `rightcss/reflow.mjs` (`sticksOut`, `overflowX`, `overlaps` over 8 px) run at every width as
today. No box is judged against the design at any width but the design width: that is ruling 14 of the driver
rulings (2026-11-01, mirror carry: between designs only self-consistency, overflow, overlap, clip). Gate rows,
position rows and pins run at the design width only; at every other width the page answers only to its tags and
to the break checks. Widths other than the tab's are measured in the mirror, as the measurer already does.

### Paint is judged

A mapped node with a solid fill gets a `paint` row when the element's computed `background-color` (or `color` for
a text node) differs from the fill after rounding both to 8-bit channels. Magnitude `much`. Gradient and image
fills and nodes marked `image` are exempt. `done` counts `paint` rows with `much`.

### Image collapse matches the harness

The adapter collapses a subtree into `image` only when it holds a vector-ish node (`VECTOR`, `BOOLEAN_OPERATION`,
`STAR`, `LINE`, `ELLIPSE`, `POLYGON`, `REGULAR_POLYGON`) or an image fill, and has no text and no auto-layout.
A rectangle or frame with a solid fill and no such child is a box, not an image. Check: `design_get` on Pricing
marks the same `image` set as `$S/figma2/tagged-nodes.json` (27 nodes), and on OrangeFarm the same set as
`$S/figma5/tagged-nodes.json`.

### One round per change

A `design_watch` whose measured tree equals the last round's (same element keys, same boxes at the design width)
returns the stored round with `round` unchanged and writes nothing.

### Rulings after wave 2 (2026-11-06, night)

- A node with a solid fill is a box with that background, whether or not it is an icon, a logo or a drawing. The
  image rule sentence applies only to nodes marked `image` with an image fill or a collapsed vector subtree without
  a solid fill of their own. The rule sentences in `document.ts` say so; paint and the rules never contradict.
- A stack or wrap breakpoint is the sum of each child's own minimum width (its own `minChildWidth`, or its design
  width for a leaf), plus gaps and padding. No child inherits another child's minimum.

## Ruling 2026-11-07: the pairer maps, the agent never writes ids

The "declared" source was a mistake and is withdrawn. No rule sentence, prompt or tool asks the agent to write
`data-figma` or any mapping attribute. The product reads none. The live tree's `figma` field goes.

- Mapping sources are `stored` and `voted` only. The vote proposes a pair once, for nodes the mapping does not hold;
  a stored pair is truth until its conciv key leaves the page.
- For a Figma target the voter is the Figma-node pairer of `$S/pair-figma/pair.mjs` (parents first, box overlap,
  text match for text nodes, parent's pair, image-ness, greedy one-to-one, threshold as in the script), ported as is.
  The image pairer stays for image targets. Many-to-one is allowed: a design node whose box equals its parent's and
  that has no element of its own maps to the parent's key.
- The pairer is measured before it is used: on every finished page that carries `data-figma` (ground truth), the
  attributes are stripped, the pairer runs, and the mapping is scored against the truth per depth. The score is a
  file the reader can check, not a sentence in a report.
- Every row carries the element's `source` (file, line, column) from the live tree, so the agent is told where to
  edit.
- The sentences "desktop first at 1440" and "never at 1440" become "at the design width".

### The mapping record is a selector (2026-11-07, same day)

A conciv key names a JSX site, not a rendered element: a `.map` renders one site many times, and a component's inner
elements carry one key for every use of the component. So the stored record is not `{node, key}` but
`{node, selector}`, where the selector is built from keys the compiler minted and persisted in the source
(`extension-compiler` `inject-source.ts`: `data-conciv-key` written into the file, `data-conciv-source` as
`relpath:line:col`), in the form the DOM answers:

```
[data-conciv-key=card] [data-conciv-key=row]:nth-of-type(2) [data-conciv-key=name]
```

- Descendant combinators only, so an added wrapper does not break a record. `nth-of-type` carries the instance.
- Resolution each round is `querySelectorAll` in the measurer, nothing else: one match is the element, zero is
  "not rendered", more than one is "ambiguous" and the node is re-voted.
- The vote proposes the selector once, from the pairer's element: its own key, the keys of its ancestors that have
  one, and its index among same-key siblings at every level that has more than one. Stored after; a selector that
  keeps matching one element is never re-voted.
- Many nodes may hold the same selector. A row names the node, the selector, and `data-conciv-source` of the
  matched element as `file:line:column`.
- Because the compiler persists keys into the file and re-stamps on HMR, an edit never changes a key; the mapping
  survives edits without a re-vote.

### Instances are named by the app's list key, not by position (2026-11-07, same day)

`:nth-of-type` goes. A site rendered many times gets its instance name from the list key the app passes
(`key={customer.id}` in React or Preact, the vnode key in Vue, the item index in Solid's `<For>` unless the app
exposes an id), read through the framework adapter the measurer already has (the one that fills `instance` and
`owner`; `owner` is null when the framework is unknown). The widget stamps it on the element as
`data-conciv-instance="<conciv key>/<list key>"` for every ancestor level that repeats. The selector then reads:

```
[data-conciv-key=card] [data-conciv-instance="row/cust-2"] [data-conciv-key=name]
```

A record survives reorder, insert and delete while the app keeps its key. When the framework is unknown, or the
app passes no key or the index, the instance is the index and the record is positional, which is then the truth.
The vote decides once which design instance is which list key; the record holds the key after. Nothing in the
record or the resolver is framework-specific; only the adapter that reads the key is.

### The conciv id is the key of every layer; the vote reads every layer (2026-11-07, same day)

Decided by Omri before the three-tools spec and not built until now: the conciv id maps everything. Every layer is a
lookup by id, arrays allowed:

- `getDOM(id)`: the live elements stamped with the id (several when the site repeats), with box and text.
- `getCSSOM(id)`: the winning declarations on those elements (display, flex direction, sizing, position).
- `getSRC(id)`: the JSX site the compiler stamped: file, line, column, element name, class names, parent site id.
- `getFOM(id)`: the Figma nodes mapped to the id. This is the stored mapping. Figma node to id is a derived view.

What goes: the stored list keyed by Figma node holding a selector. The record is `id -> figma nodes`; the selector
for an instance is derived from the id and the list key as the previous ruling says.

The vote scores a Figma node against an id over every layer, not the DOM box alone:

- DOM: box overlap against the parent's element, text dice, as today.
- SRC: the element name against the node's kind (text to text-capable element, image to an image or empty
  element, frame to a container), the class names and the element name against the node's name by the same dice
  used for text, and the parent site id must be mapped to the node's parent or an ancestor within the implied
  groups.
- CSSOM: the layout role: a node with auto layout scores against an element whose winning `display` is flex or
  grid in the same direction; a text node against an element with no flex children.

Same scoring shape as the pairer (weights in the one place, named), parents first, greedy, threshold, confidence and
margin kept. The Sidebar case of 2026-11-07 (`1:371` onto `nav.lp-items` at 0.56 over `aside.lp-sidebar`) is the
test: SRC names and parentage decide it.

A pin is re-voted when the evidence under its id changes: the element's box moved against its parent by more than
the gate's `slightly`, the SRC site changed element name or class, or a sibling id now scores above the pinned id by
more than the margin. A pin is not re-voted because the agent edited an unrelated file. Pins are stable against
edits, not against evidence.

### Every run writes to the design database (2026-11-07, same day)

The design extension owns its data. Core gives an extension `server.stateDir` and nothing else, so the design store
moves from unstorage into the extension's own SQLite file, `.conciv/design/design.db`, opened with `node:sqlite` and
drizzle inside the design package, with its own schema and migrations. Nothing is added to `@conciv/db` or to the core
CLI. Everything the tools see or decide is a row, so a run can be queried after the fact to find patterns and fix the
tools:

- `targets`: the registered design, its link, design width and height, image path, registered at.
- `rounds`: target, round, counts, coverage counts, pixel share, tree hash, at.
- `rows`: target, round, id, Figma node, source file line column, selector, kind, magnitude, width, text.
- `fom`: target, id, Figma node, confidence, margin, round voted, round re-voted, the reason it was re-voted.
- `votes`: target, round, Figma node, candidate id, score per layer (dom, src, cssom), total, won. The data the
  calibration of 2026-11-07 was computed from by hand.
- `tool_calls`: target, tool name, input, reply bytes, duration, at.
- `runs`: the harness run: model, prompt head, started, ended, cost, verdict. Written through the extension (the trial
  calls it), never by opening the file from outside.

Images (live, diff, design) stay files under `.conciv/design`, referenced by path.

Two things taken from swamp's data catalog (`.swamp/data/_catalog.db`): every row carries provenance, the target, the
harness run id when there is one, the round and `at`, so a question can be scoped to one run or compared across runs;
and the data is queryable by the model. A fourth design tool, `design_query`, takes read-only SQL over this file and
returns rows as JSON, registered beside the other three and offered to every agent, the page builder included; it asks
only what it needs, so nothing bloats its context. The trial's `query` command calls the same tool for a person.
