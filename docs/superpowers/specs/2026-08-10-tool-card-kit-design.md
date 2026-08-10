# Tool-card kit: one vocabulary under @conciv/ui-kit-chat/tools

Date: 2026-08-10. Status: design approved in session (subpath decision by Omri); open items carry
recommendations awaiting confirmation. Follow-up to epic #344 / PR #348.

## Problem (from the two-agent survey of ~40 cards)

Only the 7 page-extension cards and MetaToolCard build their UI from shared, meta-driven
vocabulary. Everyone else hand-rolls: ~25 cards hardcode icon+title ignoring catalog meta; 7 local
code-block class/option variants (no two identical); 8 divergent error treatments; 5 independent
status-to-visual maps; two chip vocabularies plus 3 inline mono-pill copies; 6 cards bypass the
shell and silently lose status dot, duration and auto-open-on-approval; tanstack rebuilt the row
vocabulary locally; test-runner runs a parallel `pw-*` token system with zero `--chat-*` usage.
No packaging blockers anywhere: every card-bearing extension already depends on ui-kit-chat and
externalizes it.

## Structural decision

All tool-card vocabulary lives under the **`@conciv/ui-kit-chat/tools` subpath**:

- The existing ~20 tool-domain files (ToolCard, CollapsibleCard, chip, json-tree,
  element-preview, tool-icon, tool-group, meta-tool-card, tool-fallback, permission-card,
  tool-call-card, inline/note rows, primitives/tools/\*) move under the subpath. The package root
  keeps chat primitives (composer, thread, messages, ...). Root re-exports may exist only as
  temporary migration aliases and are deleted before the PR lands (v0, no shims).
- `@conciv/ui-kit-chat-tools` remains a card COLLECTION (foreign-harness cards) and consumes the
  subpath; the dependency direction ui-kit-chat-tools -> ui-kit-chat is the only allowed one.
- Rationale for not splitting a package now: extensions all externalize ui-kit-chat so bloat
  ships nothing; a package split requires inverting CollapsibleCard's thread-viewport coupling
  (holdPosition) and moving message dispatch, which does not belong in a pixel-identical
  migration PR. The subpath is the cut line if a real split is ever wanted.

## New primitives (all under the subpath)

1. **CardShell + cardHeader** (lifted from extension-page cards/shared.tsx): meta-driven icon,
   title, tooltip, badge from `ctx.catalog.meta`, wrapping ToolCard. MetaToolCard is re-expressed
   through CardShell so exactly one header composition exists.
2. **CodeBlock + DiffBlock** components wrapping SolidCodeBlock/SolidFileDiff with the blessed
   theme/options and a size variant. Class/option constant PAIRS stop being exported; the 7 local
   variants die.
3. **ErrorBlock**: the single error presentation (label + message, danger tokens). Replaces the
   8 divergent treatments (MetaToolCard danger text, code-run ErrorBox, tool-fallback ToolError,
   the 5 copy-pasted extension divs).
4. **Status vocabulary**: one status-to-dot/icon module (built on ui-kit-system StatusDot),
   consumed by ToolCard, InlineRow, tool-fallback, todo-card. One duration formatter (the
   tool-util one; tool-fallback's duplicate dies).
5. **Chip family**: ToolChip merges into the kit as a Chip variant (one component, variant/tone
   props) - recommendation pending Omri's confirmation. chat-tools re-exports during the
   migration commit only.
6. **ActionRow**: in-card button row (approve/deny, open-in-editor, fix-this) with the shared
   button classes; permission-card and tool-fallback stop duplicating BTN/ALLOW/DENY.
7. **CollapsibleSection**: nested in-card collapse (header row + chevron + content) on Ark
   Collapsible; driving consumer is test-runner's per-file/per-test tree (PR 2).
8. **parseResultPayload extension**: mixed image+JSON tool results (whiteboard's shape) plus a
   blessed result-image rendering, retiring whiteboard's card-util hand-parsing and raw img.

## Conventions (enforced after migration)

- Cards compose CardShell (or ToolCard for a genuinely custom header). CollapsibleCard is never
  imported by a card directly - status dot, duration, auto-open-on-approval become impossible to
  lose. Lint rule added once migration completes.
- Tools declare `meta.icon` (and label) in their defs; cards do not import lucide for headers.
- Decisions (Omri, 2026-08-10 - all three open items confirmed):
  (a) Chip unification as ONE component whose variants are defined with cva
  (class-variance-authority) over UnoCSS utility literals - not hand-rolled Record maps +
  template concatenation. cva is a new dependency (user-mandated); class strings stay static
  literals so UnoCSS extraction keeps working. The convention applies to every variant-bearing
  primitive this rewrite touches (Chip tones/kinds, NoteRow tones, CodeBlock/DiffBlock sizes,
  status vocabulary, ActionRow) and ui-kit-system Button/StatusDot migrate to the same cva
  pattern where the rewrite already touches them. Existing `${BASE} ${VARIANT[x]}` maps in
  touched files are replaced, not duplicated.
  (b) Tanstack's 11 tools get real `meta.label` entries in PR 1.
  (c) Auto-open-on-approval restored everywhere (bash/file-read/todo lacked it by accident of
  shell bypass, not by design).

## Completeness inventory (from the orphan sweep - the rewrite touches ALL of these, nothing else exists)

Beyond the surveyed card sets, the sweep found these additional consumers the rewrite must carry:

- `apps/conciv/src/pane/tool-fallback-card.tsx` - the app's 23-line ToolFallbackCard built from kit
  fallback primitives; re-express on the new shell or delete in favor of the kit fallback.
- `apps/conciv/src/pane/chat-pane.tsx` - dispatch assembly (`ToolCardEntry[]` list); stays wired to
  whatever the rewrite renames.
- `packages/extension-testkit/src/card-harness.tsx` - `mountToolCard` helper; one file cascading to
  4 extension test suites (recorder, tanstack x2, whiteboard).
- `packages/extension/src/collect-client.ts` + `types.ts` - `collectToolRenderers` plumbing; type
  compatibility only.
- `packages/protocol/src/tool-view-types.ts` + `tool-icon-types.ts` - the vocabulary contract; all
  7 icon keys have live consumers, no orphans.
- `packages/extensions/ios` - declares `meta.icon` on its tools, has no card; a vocabulary consumer
  that must not be missed on renames.

DOM-asserting tests that break on renames (complete list): the two ui-kit-chat-tools browser tests
(catalog-cards, page-tool-cards) and `apps/conciv/test/tool-card-dispatch.browser.test.tsx`.

Explicitly cleared by the sweep (zero card vocabulary): apps/site, apps/examples/_, all e2e/_
consumer apps, packages/try, preact, react, mascot; storybook globs already cover every story
directory. Zero orphan/unregistered card files exist. The attachment-card registry
(`define-attachment.ts`, AttachmentCardEntry) is a parallel system and stays out of scope.

## Stacking

This work stacks on feat/tool-cards (PR #348): branch `feat/tool-card-kit` off the rebased tip,
PR based on feat/tool-cards, retargeted/rebased onto main after #348 squash-merges. PR 2
(test-runner re-skin) stacks on PR 1. Note: a peer session owns PR #348 review comments and its
branch pushes; the kit branch must be cut AFTER that session force-pushes the rebased stack.

## PR plan

- **PR 1 - primitives + invisible migrations**: subpath restructure, new primitives, migrate all
  cards whose swap is visually identical by intent: chat-tools builtins, code-run, ui-card diff
  path, tanstack (11), recorder, whiteboard (2), permission-card + tool-fallback re-expressed on
  shared shell/status/error/action primitives. Review criterion: before/after screenshots match.
  Storybook gaps get stories as cards migrate.
- **PR 2 - test-runner re-skin**: port off `pw-*` tokens onto chat tokens +
  CollapsibleSection/status vocabulary/ActionRow, keeping the nested-collapse UX. Deliberate
  visual change, own screenshot review.

Whiteboard caveat: its test suite is CI-only; local evidence for whiteboard card migrations is
typecheck/lint plus storybook stories; behavior proof is the PR's CI run.

## Out of scope

Package split (@conciv/ui-kit-tool-cards), terminal/try-it (no cards), composer/thread work,
approval-flow rework (resume/respondToApproval).
