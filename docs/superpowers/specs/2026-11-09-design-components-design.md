# The component catalog: what exists here, and which of it each design node is

Companion to `2026-11-06-design-three-tools.md`. That spec pairs a design's nodes to the page's elements and tells the
agent what differs. This one gives the agent, before it writes a line, the components the project already has, and
ties each design node to the components that render it.

## Why

The x-ray overlay was rebuilt through our own loop on 2026-11-09. The agent hand-wrote buttons, tabs, checkboxes, a
table, a slider, a tooltip and a copy button while `@conciv/ui-kit-system` sat one import away with every one of them.
The brief never named the kit, the tools never did either, so the agent could not know. Every coding agent on every
repo has this blind spot: it builds what it can see in the files it was pointed at. The tooling can see the whole
project; it must say so.

## Intent

An agent asked to build a design in a project is told, in the same reply that hands it the design, which components
the project already has, ranked by how much the project trusts them, with the import line and the props that matter.
Where the tooling is confident, a design node already names the component it should become. After a round, the
mapping records which components rendered which nodes, in both directions, so the x-ray can show "this node is a
`SegmentGroup`" and the catalog can show "`SegmentGroup` renders these nodes on this page".

## Goals

- The agent never says "I did not know it existed". Every component reachable from the project's Vite entries is in
  the catalog, nothing is hidden by a filter; rank does the thinking.
- The list is current. A component added a minute ago is in the next reply; one deleted is gone. No manual refresh,
  no stale cache.
- One catalog per project, shared by every worktree and checkout of it.
- One implementation behind the MCP tool and the CLI (`conciv tools design components …`).
- The relation between design nodes and components is many to many and queried both ways.

## Previews

The dev server renders any catalog component alone, in its default state, at `/__conciv/preview/<component id>`
(a virtual module that imports the component by its specifier and mounts it with the props the story or the
parameter defaults give; no props means the bare component). The preview serves three readers: the Parts view shows
it in each row; the hinter compares its pixels against a design node's render as a look vote beside the name and
variant votes; `design_components(show)` returns its path so an agent can `screenshot_node` it. A component whose
preview throws is listed with "no preview" and the error's first line.

## Non-goals

- A type checker. Props come from the parser and one hop of following a `Props` type; what it cannot resolve says
  "see file".
- Writing components or stories for the project. The catalog describes, it does not create.
- Design tokens. Tokens are already named by the look rows (`Look is measured per node; tokens are named`).

## Anti-goals (what would make this a failure even if it works)

- A list so long the agent skims it. The kit tier comes in full, the app's own components in full when under a few
  dozen, the rest as a count with `show` for depth.
- A per-project configuration file the user must write before anything appears. The scan runs on what is there.
- A filter that assumes a kit. On a plain Vite app with no kit, the app's own `Button.tsx` is the kit; rank must
  find it without a rule.
- A component id that depends on compiling. Conciv keys are minted when the compiler sees a file and never for a kit
  consumed from a built package; a static scan cannot rely on them. A component's id is the hash of its repo-relative
  file path and export name, stable across machines and worktrees, written into no file. The conciv key still joins a
  rendered element to its component through the source line the mapping stores.

## Constraints

- Scan from the Vite entries, never by running the server: every `vite.config.*` in the repo (and the `index.html`
  roots it names) gives entries and resolve rules; walks are unioned. Resolve with `oxc-resolver` fed Vite's aliases
  and conditions so workspace packages resolve to source. Parse with `oxc-parser` (already in the catalog of
  dependencies; Vite 8 ships it under rolldown).
- The import graph is the edges of that walk; counts are repo-wide. A dev server that is running adds the live layer
  (rendered on this page now) through the module graph it already holds, and its watcher triggers a rescan on change.
  With no server, the CLI rescans on demand.
- The catalog lives in the home database (`packages/db/src/home-db.ts` on main, `home.db` under the user's
  application support directory, already holding `engines` and the hub tables), keyed by project (the git remote plus
  the package root in a monorepo; a tree with no remote falls back to the root package name). Scans are stored per
  worktree under that project key with the tree they scanned; a read uses the scan of its own tree and may query
  across trees. The design branch gains the home database when it rebases onto main; until then the same tables
  live in the checkout's `conciv.db` behind the same functions.
- Freshness without a dev server is a fingerprint, not a walk: the git tree hash plus the mtimes of dirty files
  under the walked set. A read whose fingerprint differs rescans before it answers. With a server, its watcher
  rescans on change.
- `design_components(link)` takes the live tier ("rendered on this page now") from the page registered for the
  target behind `link`; without a link the reply is the static repo-wide ranking. The CLI shows the live tier when a
  server is running and a target exists.
- The relation table is backfilled from rounds already stored: the mapping carries node, element and source line, so
  the 2026-11-09 x-ray runs count in Measure.
- User flags live beside the catalog: `prefer` pins to the top, `do-not-use` removes from every reply. Flags are set
  through the CLI and the tool, never by editing a file.
- Coding rules of the design package hold: one export per file, functions only, no comments, no casts, no `any`,
  no `else`, no `let`, files under 600 lines, no new numeric constants, library first.
- Nothing in the existing replies changes shape for a project that has no components; the new section is absent, not
  empty.

## The catalog entry (what the agent reads)

Per component, in this order:

1. The import line, ready to paste, with the package specifier (`import {SegmentGroup} from '@conciv/ui-kit-system'`),
   and the file path beside it for `show`.
2. One sentence: the doc comment's first sentence, else the README line that names it, else the story title.
3. The props that matter: variants as enums, slots, the required ones. Not every prop.
4. One usage snippet: the shortest story that uses it, else the shortest call site.
5. Rank facts in a few words: `kit · 84 imports · 2 on this page`.
6. Flags.

A component is any exported function the walk sees rendering markup (JSX in its body, or a call the framework
plugin names as a render). Pages and layouts are components too; they rank low.

## Dependencies (`node_modules`)

The walk follows imports into `node_modules` as Vite resolves them. A workspace kit resolves to source. An npm kit
resolves to its `exports` target, a built `dist`: there "renders markup" is read from the package's `.d.ts` (an
exported function declared to return `JSX.Element` or the framework's component type), and props from the declared
type, one hop. A dependency component's id is the hash of package name, version and export name, never a path.
Import count is counted in the project's own imports, so an npm kit used 100 times ranks like a workspace kit. The
rendered element's source line is the project's own call site (`<Button>` in its file, the compiler never stamps
`node_modules`); the tag resolves through the import to the dependency's component id, so the relation holds without
touching the package. A dependency's own dependencies are not walked unless the project imports them.

Source lines inside a dependency: the compiler stamps only files Vite transforms, and dependencies are pre-bundled,
so an element rendered inside a kit component has no source line of its own. Attribution stops at the call site:
the element inherits the project's line where the component is written, and the catalog id on that line gives
`show` for the inside. Stamping the pre-bundled output through the dependency optimizer, mapped through the
package's sourcemap to its original source, is a later ruling with its own measurement on a real npm kit; it is
not part of this work.

## Rank

In order: flagged `prefer`; rendered on this page now (live graph); repo-wide import count; lives in a package whose
name says kit or ui; has a story; has a doc comment or README mention; has a Code Connect file. Import count is the
strongest cheap signal and comes free from the walk. If raw counts mislead on a real repo (a layout imported once
yet on every page), weigh an importer by its own importers in one pass; that is left to measurement, not built first.

## The relation (FOM to COM)

One table, `design_node_components(round, node, component, source)`: a design node, the component whose defining
element its paired element sits under, the source line that tied them. Filled from the mapping the round already
stores (node to element to source line); a source line resolves to its enclosing component through the catalog.
Queried both ways through `design_query` and the CLI. The x-ray reads it for "this node is a `SegmentGroup`"; the
catalog reads it for "`SegmentGroup` renders these nodes".

## The forward hint

`design_get` carries, per node, the top component guess and its import line when a vote over the catalog is
confident: name similarity, prop and variant fit against the node's look, Code Connect when the project has it. No
guess when the vote is not confident. The agent may ignore it; the hint is a reply field, not a rule.

## Shape: adapters, not branches

Two interfaces beside the existing `adapters` of `DesignRuntime`, each with one first implementation and nothing
reaching around it:

- `ComponentSource`: `scan({cwd}) → Scan`. First: `vite-oxc` (the walk above). Later ones (a Storybook index, a
  Custom Elements Manifest, a shadcn registry) register in the same list and their scans are unioned.
- `Hinter`: `hint({design, ranked}) → Map<node, Hint>`. First: the name-plus-variant vote. It lives beside the
  pairers and never inside them; the pairer does not know the catalog exists.
  Config: `catalog.sources` (names; empty disables scanning), `catalog.hint` (false removes hints from `design_get`),
  `catalog.section` (false removes the list from `design_get`; the tool and CLI stay). Every off switch is one config
  line. The relation is filled from the stored mapping after the round, outside the pairer.

## The Parts view (x-ray)

A fifth rail item, "Parts". The panel: a search field; filter chips (Kit, App, Other, On this page, Preferred,
Hidden); a table built on `@tanstack/solid-table` with sortable columns (preview, part, imports, on page) and
`@tanstack/solid-virtual` for the long tail, no "N more"; the selected row expands in place with the import line,
sentence, props that matter, where it renders (node id tags), "Copy import" and "Do not use". The page outlines the
elements the selected component renders. The Pick view gains "In a component" with a small preview. Mockup: frames
`11:108`, `11:397`, `11:572` of the x-ray Figma file. Built through the loop like the other views.

## Surfaces

- MCP: `design_components(link?)` lists (ranked, tiers as above); `design_components(link, show: name)` gives source
  and all props; `design_get` gains the per-node hint and the catalog section; `design_query` reads the relation.
- CLI: `conciv tools design components list|show <name>|flag <name> prefer|do-not-use`, same implementation.
- No new numeric constants: tier sizes and confidence come from the design config that already holds tolerances.

## Left to the builder

- The exact walk: how `vite.config.*` files are found and read without executing arbitrary config (Vite's own
  `loadConfigFromFile` is acceptable; say so in the first commit).
- How "renders markup" is detected for Solid, React and vanilla web components from the parse alone, and which
  framework plugin signals are trusted when present.
- The `Props` one-hop follow and what "props that matter" selects (variants, slots, required) from the type.
- The shape of the per-node hint vote and where it sits among the existing voters.
- Migration for the new table and the catalog tables in the global database.

## Measure

Rerun the x-ray round state with the catalog in the reply: the agent's first commit imports from the kit, counted
as "kit imports in the final source" against the 2026-11-09 run (one, `EnvironmentProvider`). Then six a side on
figma5 with and without the catalog section: done, rows, cost, and kit imports.

## Token drift (2026-11-09)

The x-ray rebuild showed the failure this section prevents: three of six agents removed kit components because the
mockup's radius and font disagreed with the kit's tokens, and a kit component used correctly could never reach zero
rows. The agent was graded against a design that contradicts the design system, with no signal that the element it
was editing belonged to a component.

Rulings:

- Pairing is untouched. The pairer never reads the catalog or the tokens; the relation and the token map only
  classify the rows of an element that is already paired.
- Tokens are mapped, not only named. The catalog gains a token map per project: the kit's design tokens (CSS custom
  properties and the theme values behind them, read from the kit's token source or its emitted CSS) joined to the
  design's variables (Figma variable names and values the look rows already name). A `TokenSource` adapter beside
  `ComponentSource` does the reading; the first implementation reads CSS custom properties from the kit's stylesheet
  and the Figma variables from the design.
- A row on an element rendered by a known component, whose differing property is token-valued on both sides, is a
  `token-drift` row, not a `paint` or `geometry` row: "SegmentGroup uses radius/md (8px); the design wants radius/lg
  (12px)". It names the component, both tokens and both values. The rows of one component collapse to one drift row
  per token.
- A drift row is never the agent's to fix by editing the element. Its remedy text says so: change the token in the
  kit, or the variable in the design, or report the drift. The agent's reply and the x-ray card show it as a flag,
  and the score counts drift rows apart from the rows the agent can clear.
- A row on a known component that is not token-valued (a missing child, a wrong text) stays an ordinary row.
- Confidence gates the classification: the relation must have resolved the element to a component through a render
  site; a guess from the name hint is not enough to turn a row into drift.

Plan: the token map and the drift classification land with the relation (Task 5), measured in Task 8 as "kit
imports kept" and "drift rows" beside "rows cleared".

## Previews are read by people and by `show` first; the look vote waits (2026-11-10)

The preview route serves the Parts view and `design_components(show)`. The look hinter (a preview's pixels against a
node's render) needs the registered tab to render previews off screen and an asynchronous `Hinter`; the engine has no
browser of its own and will not get one. It is built after Measure (Task 8) shows what the name and variant hint alone
achieve, as a page verb that loads a preview in a hidden frame of the registered tab and captures it through the capture
path that exists. Until then `Hinter` stays synchronous and the preview page carries no widget.

## A named component is a row (2026-11-10)

The Parts view runs (`xray6-parts-1`, `xray6-parts-dark-1`) got the per-node hints: the reply said `hint: Chip` on the
chip nodes and `hint: Button` on the buttons, and the agent drew both by hand anyway, as every kit run before it did.
A hint is advice, and advice in a reply field is skipped. What the agent does act on is a row from `design_check`, because
rows stand between it and `done`.

So a hint with no doubt becomes a row. When a design node's name holds a kit component's name as whole words (the hint
scores 1) and the element it pairs to is not rendered by that component (the relation says another component or none),
`design_check` lists one row for the node with magnitude `component`: "<node name> is drawn by hand; the design names
`<Component>` (`import {Component} from '<specifier>'`)". The row counts toward the verdict like a paint row. A node
whose hint is a guess (under 1) gets no row; a project with no kit tier gets none; `catalog.hint: false` removes them
with the hints. A `prefer` flag on a component makes its rows fire at any hint score; `do-not-use` makes them never fire.

Hints under certainty must share a word with the component's name to be hints at all: the fuzzy score alone gave
"Part" the hint `Far` and "Header" the hint `Loader`, a third of all hints on the x-ray frame, and such a hint teaches
the agent to ignore the field.

Measure (Task 8) now has its two arms: the x-ray round and Parts states with and without the component row, kit imports
kept in the final source as the count.

## A component row fires only where the component can be used (2026-11-10, after Measure)

Measure (`$S/figma-loop/catalog-measure.md`, `xray-build.md` rows `xray7-round-cat-1..2`) showed the row as first built
misfires three ways, and no agent cleared one:

- On figma5 the 10 `Avatar` rows and the `Button` row name `@conciv/ui-kit-system`, a Solid kit, in a React host. The
  agent could not use them and said so. Hand-drawn avatars went up (2.5 against 0.5 a run) with nothing to import.
- "96K sold so far" got the hint `Far` at certainty, because "far" is a whole word of the name, and all six runs wrapped
  that text in `<Far>` to clear the row. "Problem Avatar", a problem-list label, got an `Avatar` row the same way.
- On the x-ray, `Stat` and `Table` rows named the fixture's own `./src/Stat.tsx`, a path the overlay package cannot
  import, and a run that did render the rail buttons with the kit `Button` saw its rows stay, because the overlay's
  source is not in the fixture's catalog walk and the relation never resolved.

Three rules replace "a whole-word name is a hint of 1":

1. A hint at certainty comes from Figma's own component link: the node is an INSTANCE (or a COMPONENT) and its main
   component's name, with the variant part after `/` or `=` dropped and case and separators ignored, equals a catalog
   component's name. The adapter carries the main component name per node (`figma.component`). A frame or text whose
   layer name happens to hold a component's word is a fuzzy hint under 1 at most, never a row.
2. A row fires only where the component can be used from the element's source file: the file is in the catalog walk
   (the relation can resolve it), the component's framework is the file's (the catalog records each component's
   framework from the plugin or parser that saw it render markup; the file's from the same walk), and the import
   specifier resolves from that file's directory with the project's resolve rules (a bare specifier through
   `oxc-resolver`, a relative path rewritten to the file's own relative path). The row's import line is the resolved one.
3. A row clears when the relation says the element is rendered by the named component, or by a component that itself
   renders it (the kit `Button` inside the project's own `RailButton`).

Where no rule holds the hint is still shown in `design_get` (the fuzzy hint under 1 stays advice) and no row is listed.
Measure is rerun on the x-ray round state, where the overlay is Solid, the kit is Solid and the relation can resolve once
the overlay's source is in the walk the x-ray fixture declares (the fixture's `vite.config` names the overlay entry as a
second input, so the catalog walk reaches it).
