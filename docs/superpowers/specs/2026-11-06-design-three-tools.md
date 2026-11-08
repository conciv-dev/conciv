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

### Every run writes to the database; extensions register tables and commands (2026-11-07, same day)

Core owns one database, `.conciv/conciv.db` (`@conciv/db`, drizzle on `node:sqlite`), and a generic read-only
`conciv db query "<sql>" --json` over it. Extensions do not open files; they declare, and core prefixes:

- `defineExtension({name, tables, commands, ...})`. `tables` are drizzle table definitions with plain names
  (`rounds`, `fom`, `votes`); `commands` are CLI subcommands with plain names (`query`, `runs`). Core registers the
  table as `<name>_<table>` and the command as `conciv <name>:<command>`. The extension never writes its own name.
  SQLite and MCP identifiers refuse `:`, so tables use `_` and tool names stay `<name>_<tool>`; only CLI commands use
  `:`.
- Migrations live in the extension package, generated by drizzle from its tables. `openDb` collects the migrations
  of every loaded extension and applies them with core's own, once, in one place.
- The server context hands the extension `db`: its own table objects on the shared connection, nothing else.

The design extension declares these tables; every row carries provenance (target, harness run id when there is one,
round, `at`), so a question can be scoped to one run or compared across runs:

- `targets`: the registered design, link, design width and height, image path, registered at.
- `rounds`: target, round, counts, coverage counts, pixel share, tree hash, at.
- `rows`: target, round, id, Figma node, source file line column, selector, kind, magnitude, width, text.
- `fom`: target, id, Figma node, confidence, margin, round voted, round re-voted, the reason it was re-voted.
- `votes`: target, round, Figma node, candidate id, score per layer (dom, src, cssom), total, won. The data the
  calibration of 2026-11-07 was computed from by hand.
- `tool_calls`: target, tool name, input, reply bytes, duration, at.
- `runs`: the harness run: model, prompt head, started, ended, cost, verdict, written through the extension (the trial
  calls it), never by opening the file from outside.

Images (live, diff, design) stay files under `.conciv/design`, referenced by path. The store interface stays; its body
becomes queries on these tables; unstorage goes.

Queryable by the model, as swamp's data catalog is: a fourth design tool, `design_query`, takes read-only SQL over the
design tables and returns rows as JSON, offered to every agent, the page builder included; it asks only what it needs,
so nothing bloats its context. `conciv design:query` is the same for a person.

### Assets come from Figma through the tool; the agent draws nothing (2026-11-07, same day)

Side by side on 2026-11-07 (viewer, seven live pages): the tool-built pages match the design's layout line for line
and look unfinished, because the rules make every image node an empty div and the agent never sees the design image;
the plain-Claude pages drift in spacing and look finished, because they drew icons, avatars, charts and checkmarks
from the image. The layout win is real; the look is lost by our own rules. The fix is assets, not drawing.

- `design_get` exports every vector and image node of the frame through the Figma REST images endpoint (svg for
  vectors and icons, png at the design's scale for raster fills and avatars) into the project under a folder the
  config names, one file per node, named by node id and name. A node that is an instance of the same component as
  another shares the file.
- The tagged tree names the file per node (`asset: "<path>"`). The rules change: an image node is an `img` (or an
  inline svg for vectors that need to take the text color) with that file, sized by its box; the agent never draws
  an svg, a data url or a css shape, as before. The placeholder rule goes.
- Export happens once per registered design and is stored with the target; a second `design_get` returns the same
  paths. A failed export for a node leaves the node without `asset`; the rule for it is the empty div, as today, and
  coverage reports the count.
- Paint rows: a fill or border the gate measures but hides below `much` and `noticeably` on a node with no children
  (pills, dividers, badges) is a row at `noticeably`, so the Monthly pill and the card dividers are told.
- Proof: the same three runs on both designs; then a blind screenshot comparison, design against tool page against
  plain-Claude page, scored by a person or a separate model that never saw the rows. The watch is not the judge of
  the look.

### Queries are typed, never SQL (2026-11-07, same day)

The first database lane shipped `conciv db query "<sql>"` and `design_query {sql}` with a read-only sandbox built
from an `EXPLAIN` walk. Omri: no path may take a statement, for anyone. Raw SQL goes from the CLI and the tool.

One typed API, the shape swamp's `data query` has, over named logical sources, read and write:

- read: `{from, where, select, limit}`. `from` is a source name (`rows`, `votes`, `fom`, `rounds`, `tool_calls`,
  `runs`, `labels`, `notes`); `where` is a predicate in a small expression grammar (field, comparison, `and`, `or`,
  `in`, `contains`) compiled to a parameterized `SELECT`; `select` is a list of field names; `limit` a count. An
  unknown source or field is an error that names the known ones. No argument lists the sources and their fields.
- write: `{into, values}` for the sources declared writable, compiled to a parameterized `INSERT`. Writable: `labels`
  (target, round, node, id, verdict right or wrong, by, note) and `notes` (target, round, text). The seven fact tables
  are written by the tools only.

Sources are a contract over the tables: a migration may move columns while the source keeps its fields. The same API
serves `conciv db query` (core, generic over every extension's sources), `conciv design:query`, and `design_query`
(the page builder gets read; a reviewing or learning agent gets read and write). The `EXPLAIN` sandbox, the single-
`SELECT` wrapper and `readOnlyQuery` go.

### Three tools for the page builder: get, check, status (2026-11-07, same day)

`design_watch` watches nothing: it is one measurement on demand. `design_validate` measures nothing: it reads the last
round and says one word. Omri: the agent-facing tools are `design_get`, `design_check` and `design_status`; `design_query`
and `design_write` stay ours and are never given to the page builder.

- `design_get(link)` as today: the design as data plus the rules.
- `design_check()` is `design_watch` plus the verdict in the same reply: rows, reflow, coverage, `verdict` (`done`,
  `not yet`, `stalled`, `unsettled`) and `reasons`. One call is one round. `design_validate` goes.
- `design_status()` reads the last stored round, no measurement: verdict, counts, coverage, what is left. For an agent
  resuming cold or checking before it edits.
- Renames carry through `defs.ts`, the trial commands (`check`, `status`), the harness prompt heads, the IT file, the
  README and the stored `tool_calls.tool` values from the rename on; old rows keep the old name.

### design_get never returns the whole design (2026-11-07, same day)

On OrangeFarm the page builder called `design_get` six times at 77 KB a reply and sliced the tree in code. Omri: no call
returns the whole tree.

- `design_get(link)` returns the outline: the root and the top two levels, each node with id, name, box, layout words,
  reflow tags and the count of descendants it holds; plus the rules.
- `design_get(link, node)` returns that node's subtree in full detail with the path of its ancestors.
- The rules say: read each section with its node id before building it. Coverage in `design_check` reports the sections
  never built.

### The outline is withdrawn; the design is markup the agent can query (2026-11-07, evening)

The outline ran against the full tree on sonnet, same pages, same build: full tree 3 of 3 done, $3.83; outline 2 of 3,
$4.55, 152 nodes missing at the first check on OrangeFarm. The agent built from the outline without reading every section.
A single section is 12 to 32 KB, so the outline saved bytes only because the full-tree agent reread 77 KB seven times. The
outline goes.

Omri: `design_get` returns something the agent can select from with `querySelector` and `querySelectorAll`.

- The design is one markup document: one element per node, the node type as the tag (`frame`, `text`, `image`, `group`,
  `shape`), attributes for id, name, box, layout words, fills, strokes, font, reflow tags, implied, the known conciv key;
  text content as the element's text. No repeated keys, no JSON. The rules travel as the same sentences, once.
- `design_get(link)` returns the whole document. `design_get(link, selector)` runs `querySelectorAll` over it and returns
  the matching elements with their subtrees and the path of each match's ancestors. The agent asks by selector, the tool
  slices; nothing is paged, nothing is hidden.
- `design_check` rows quote the node in the same selector form (`[id="1:371"]`), so a row and a get speak one language.
- The agent is told how big the document is and that a selector gets a part of it. Nothing forces a selector; coverage in
  `design_check` reports what was never built.
- Proof is the same A/B: three sonnet runs on the markup build beside the three full-tree JSON runs of wave 9, on bytes,
  rounds, verdicts, cost and nodes missing at round 1.

### Progress between rounds is reported, with changed regions resolved to ids (2026-11-07, evening)

Omri: the agent needs to know whether it is progressing. The rounds table holds everything; the diff between a round and the
one before becomes a `progress` block on `design_check` and `design_status`:

- rows closed, new and kept since the previous round, the kept ones listed (kept is the `repeat` column);
- nodes newly mapped and nodes lost;
- pixel share against the design for this round and the previous one;
- the changed ratio between this round's screenshot and the previous one's, anti-aliasing excluded, and the changed regions
  (diff mask, tiled, clustered, noise dropped, capped with an aggregate) each resolved to the conciv ids whose measured boxes
  it overlaps, with file and line. This is the practice of SnapEye (MIT), ported as practice, with the resolution to ids
  that SnapEye has no mapping for. See `$S/figma-loop/ref-snapeye-progress.md`.
- Captures are frozen first (animations paused and rewound, transitions off, restored after), so an unchanged page
  measures identical twice.
- In words, once: "your edits since the last check changed no pixels" when the ratio is zero while rows remained.
  The verdict logic does not change; `progress` reports, `stalled` still decides.

### Scalars are columns, lists are tables (2026-11-07, evening)

Swamp's catalog is flat columns with one JSON column for tags. Ours grew JSON by convenience: `counts` beside the columns it
duplicates, `coverage` hiding `mapped` behind a path, `reflow_detail` a list in a cell. Omri: no reason for it.

- A scalar is a column. A list is a table keyed by target, run, round. JSON stays only for a blob nobody filters on.
- `rounds` loses `counts` and `coverage`; it gains `mapped`, `rendered`, `revoted`; `design_missing` holds the missing nodes;
  the reflow widths live in rows or `design_widths`.
- Progress is columns on `rounds` (`closed`, `opened`, `kept`, `gained`, `lost`, `changed_ratio`, `pixel_before`, `note`) and
  a `design_regions` table, one row per region and id.
- The tool replies keep their shapes; only storage flattens.

### Markup withdrawn; the design stays whole JSON; unsettled is never a trap (2026-11-07, night)

Markup against full-tree JSON, sonnet, same pages: JSON 3 of 3 done at $3.83; markup 0 of 3 at $4.14, stuck rows 264 and
155 against 38 and 2, no agent used a selector. Bytes fell eight times and the pages got worse, as with the outline. Every
time `design_get` got smaller the agent built less. Omri: revert.

- `design_get(link)` returns the whole design as JSON, as before wave 9 Part C. The `selector` argument and the markup go.
  `design_get` is not shrunk again; its cost is accepted.
- `unsettled` is never a trap. On Pricing the agent restructured the page, under half the nodes rendered, and the check
  answered `unsettled` eleven times. From the second consecutive `unsettled`, the reply carries the coverage (which nodes
  are gone, by name and id) and the rows the gate can still compute, and says "the page renders N of M nodes; the rest are
  listed in coverage.missing".

### The twelve largest regions, not one box (2026-11-08)

Past twelve changed regions, SnapEye replaces them with the one box around all of them. On a page that box is the page,
and the ids it names are always the root containers (Dashboard, Body, Row on OrangeFarm), whatever the agent edited. A
deviation from SnapEye: the reply lists the twelve largest regions with their ids, `count` says how many changed and
`truncated` stays true.

### Progress is stored, not shown by default; A/Bs run six a side; code mode runs in the QuickJS thread (2026-11-08)

Progress shown to the agent against hidden, sonnet, three runs a side: shown 1 of 3 done at $4.75, hidden 2 of 3 at $4.50,
and the rounds after a "changed no pixels" note closed their kept rows the same either way. Progress stays computed and
stored for our queries; the reply leaves it out unless the trial's `--hide` is turned around into a show flag for a later
test. Three runs a side cannot separate two reply shapes; from here a reply A/B runs six a side.

The engine died twice in eight runs. The crash reports: one `SIGSEGV` inside `isolated-vm` creating a context under the
Homebrew node 25 while the repo asks for node 26; one `SIGSEGV` in V8's `JSON.parse` on the main isolate under the nvm node
22 while `isolated-vm` isolates share the process. The code-mode driver list tries `@tanstack/ai-isolate-node`
(isolated-vm, a native module built for one node ABI and loaded by whichever node runs) first and the QuickJS worker thread
second. The QuickJS thread is out of the server thread, memory-capped, and needs no native build: it becomes the only
driver; `isolated-vm` and `@tanstack/ai-isolate-node` leave the dependency list. The note also reads the reflow widths: an
edit that moved nothing at the design width but changed the reflow rows is not "changed no pixels".

### Look is measured per node; assets come from Figma; tokens are named; the nodes are a table (2026-11-08)

Layout holds on both models: with the tools the pages end at 0 to 2 layout rows against 30 to 91 without. Look has no
measurement yet: the gate scores boxes, and a page of grey rectangles in the right places is `done`. Omri: the real app
binds colors, padding, radius and fonts to variables, so the look rows must speak in token names even where the fixture
does not; and a conciv id must answer with its FOM, expected fill and font included, to the agent and to us.

- The design nodes are a table, `design_nodes`, one row per Figma node, flat: id, type, name, within, depth, box, fill
  kind and hex, fill opacity, stroke hex and weight, radius, font family, weight, size, line height, text align, text,
  opacity, `image`, `asset`, and one `token_*` column per bound field (fill, stroke, radius, font, gap, padding) carrying
  the variable name, or its id when the variables endpoint is not open to the file. Written when `design_get` stores a
  target. The `fom` source joins it, so one query answers "what should [1:371] look like".
- Assets come from Figma through the tool. Every image node and every vector node (icons, logos) is exported once by the
  REST images endpoint, PNG for pictures and SVG for vectors, written under the project's `public/design/`, and the node
  carries `asset: '/design/<id>.svg'`. The rule "an image node is an empty div" goes; the rule becomes "a node with
  `asset` shows that file and draws nothing else".
- Look rows sit beside layout rows, magnitude `paint`, one kind per field: fill, text color, font family, font weight,
  font size, line height, radius, border, opacity, and image. Expected comes from `design_nodes`, found from the cssom
  the measurer already reads; comparison is on resolved values (hex, px), so the app may use tokens or literals. Image
  rows compare the element's own paint (snapdom) against the export, through pixelmatch. The row names the token when the
  field is bound: `wrong fill at [1:371]: color/brand/primary (#426BF2) expected, #4A6CF7 found`. Rows that share one
  token are reported as one row naming the token and the ids; the table keeps them per node.
- `paint` rows block `done` like `noticeably`, except font family, which reports without blocking: a family the page
  cannot load is not the agent's fault.
- `design_query` opens to the agent in one A/B arm, with `design_get` left whole; a smaller `design_get` lost twice.
  Six runs an arm: look rows alone, look rows with the query, against the six hidden-progress runs of wave 13.
- A blind judge (opus, page screenshot beside the design render, a score and one line) joins the table for every run,
  so look has a number not tied to our rows.
- Capture is not a mode of the design extension. The page verbs `screenshot` and `screenshot_node` are answered by the
  page extension's client (region, snapdom) when nothing else does, and by a `browser` extension from the server when it
  is loaded: it attaches to an existing browser (never launches one) through `puppeteer-core`, one driver per protocol,
  CDP for Chromium now, WebDriver BiDi for Firefox and Chromium later, and takes true-pixel screenshots at a configured
  device scale, clipped per node. The engine lets an extension answer a page verb from the server before the browser is
  asked. Design calls the verbs and never learns who answered; the round stores the capture path that ran.
