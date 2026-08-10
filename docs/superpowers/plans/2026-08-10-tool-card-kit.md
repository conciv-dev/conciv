# Tool-Card Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In THIS repo the orchestrator (Fable) dispatches each task to a conciv-frontend/conciv-mechanic subagent with this plan section as the definition of done; agents write code + package-scoped typecheck, the orchestrator runs all other gates.

**Goal:** One tool-card vocabulary under `@conciv/ui-kit-chat/tools` that every card in the repo composes, so all ~40 cards look and behave identically; zero orphan or legacy card code left anywhere.

**Architecture:** Move the existing ~20 tool-domain files under the `tools` subpath, add eight primitives (CardShell, CodeBlock/DiffBlock, ErrorBlock, status vocabulary, unified Chip, ActionRow, CollapsibleSection, image+JSON payload parsing), then migrate every card set onto them. Variants use cva over UnoCSS literals. Two stacked PRs: PR 1 primitives + pixel-identical migrations; PR 2 test-runner re-skin.

**Tech Stack:** SolidJS, Ark UI via ui-kit-system, UnoCSS, cva (class-variance-authority, NEW dep), solid-diffs, vitest browser mode, Storybook.

**Spec:** `docs/superpowers/specs/2026-08-10-tool-card-kit-design.md` — read it first; this plan implements it 1:1.

## Global Constraints

- Base branch: `feat/tool-card-kit` cut from `feat/tool-cards` AFTER the peer session force-pushes the rebased stack (verify `git log origin/feat/tool-cards -1` shows the rebased tip before cutting). PR 1 bases on `feat/tool-cards`; PR 2 bases on PR 1.
- House rules: functions not classes; zero comments; no `any`/`as`/`!`/`else`-where-early-return; no IIFEs; no em dashes anywhere; splitProps only; solid-primitives over raw signals; oxfmt owns formatting.
- cva class arguments must stay static string literals (UnoCSS extraction); no computed class fragments inside cva calls.
- Subpath exports: package.json `exports` gains `"./tools"` (types + import, dist-based like existing entries); tsdown config gains the entry. Root re-exports of tool vocabulary are DELETED before PR lands (v0, no shims). Temporary aliases allowed only between tasks, never at PR boundary.
- PR 1 review bar: before/after screenshots pixel-identical for every migrated card (orchestrator captures via storybook). PR 2 review bar: deliberate visual change, screenshot set for approval.
- Every migrated card keeps or gains a story; play assertions use native locators only.
- Whiteboard tests are CI-only: local evidence = typecheck/lint + stories; never run that suite locally.
- Per-task gates (agent): package-scoped `pnpm exec turbo run typecheck --filter=<pkg>` (bare filters) + the specific test files touched. Orchestrator gates between tasks: lint, format, forced package suites, fallow (0 introduced), screenshots.
- Commit per task with pathspec; batch pushes (one push per PR update, orchestrator-driven, user-authorized).

---

## PR 1 — primitives + invisible migrations (branch `feat/tool-card-kit`)

### Task 1: Subpath restructure

**Files:**

- Create: `packages/ui-kit-chat/src/tools/index.tsx` (the subpath entry)
- Move (git mv, preserving history): `src/styled/tools/*` and `src/primitives/tools/*` and the tool-domain styled files (`tool-card.tsx`, `collapsible-card.tsx`, `chip.tsx`, `json-tree.tsx`, `element-preview.tsx`, `tool-icon.tsx`, `tool-group.tsx`, `tool-fallback.tsx` + stories) into `src/tools/` (flat or styled/primitives split mirroring current layout — keep the split: `src/tools/styled/`, `src/tools/primitives/`)
- Modify: `packages/ui-kit-chat/package.json` (exports map `"./tools"`), `tsdown.config.ts` (entry), `src/index.tsx` (root DROPS tool exports)
- Modify: every in-repo importer of the moved symbols switches to `@conciv/ui-kit-chat/tools` — the sweep's list: ui-kit-chat-tools (all cards + tests), packages/tools/src/cards/_, packages/core/src/cards/_, extensions page/tanstack/recorder/test-runner/whiteboard, apps/conciv (chat-pane, tool-fallback-card, tool-view-ctx, tests), packages/extension-testkit/src/card-harness.tsx, apps/storybook stories if any import root paths
- Keep INTERNAL relative imports inside ui-kit-chat working (message.tsx dispatch imports tool-call-card relatively)

**Interfaces:**

- Produces: `@conciv/ui-kit-chat/tools` exporting exactly what the root exported before for the tool domain (ToolCard, CollapsibleCard, InlineRow, InlineShell, NoteRow, MirrorRow, Chip, ChipRow, JsonTree, ElementPreview + fixtures, tool-presentation helpers, toolStatus, parseInput, parseResultPayload, INERT_TOOL_CTX, INERT_ADD_RESULT, MUTATING_BADGE, cardPhase, cardTitle, clip, displayValue, schemaFields, toolIconRender, resultText, ToolCallCard, MetaToolCard, PermissionCard, ToolFallback pieces). Root index no longer exports any of these.

**Steps:**

- [ ] Move files with `git mv`; create subpath entry re-exporting the moved modules
- [ ] Wire package.json exports + tsdown entry; build ui-kit-chat once (`pnpm exec turbo run build --filter=@conciv/ui-kit-chat`) to verify dist layout
- [ ] Sweep-update every importer (grep `from '@conciv/ui-kit-chat'` repo-wide; each tool-domain import moves to `/tools`; chat-domain imports stay)
- [ ] Typecheck full repo (this task is the one whole-repo ripple; orchestrator runs it)
- [ ] Verify UnoCSS globs still cover moved paths (apps/storybook, apps/conciv, packages/embed uno configs use `src/**` — confirm, adjust if a glob was styled/tools-specific)
- [ ] Commit `refactor(ui-kit-chat): tool vocabulary moves under the tools subpath`

### Task 2: cva foundation + unified Chip

**Files:**

- Modify: `packages/ui-kit-chat/package.json` (+ `class-variance-authority` dep; version per npm latest passing the release-age gate)
- Modify: `packages/ui-kit-chat/src/tools/styled/chip.tsx`
- Delete: `packages/ui-kit-chat-tools/src/styled/tools/tool-chip.tsx` (after consumers migrate in Tasks 8-10; this task adds the variant, deletion lands in Task 8)
- Test: `packages/ui-kit-chat/test/chip.browser.test.tsx` (new)
- Story: extend chip stories with every variant

**Interfaces:**

- Produces:
  ```ts
  const chip = cva('<base literal>', {
    variants: {kind: {field: '...', pill: '...'}, tone: {neutral: '...', accent: '...', success: '...', danger: '...'}},
    defaultVariants: {kind: 'field', tone: 'neutral'},
  })
  export function Chip(props: {
    name?: string
    value: string
    kind?: 'field' | 'pill'
    tone?: 'neutral' | 'accent' | 'success' | 'danger'
    tooltip?: string
    class?: string
  }): JSX.Element
  export function ChipRow(props: {class?: string; children: JSX.Element}): JSX.Element
  ```
  `kind: 'field'` = today's name+value dl chip; `kind: 'pill'` = ToolChip's mono pill (tooltip via ui-kit-system Tooltip when `tooltip` set). Visuals of both EXACTLY match their current renderings (pixel bar).

**Steps:**

- [ ] Failing browser test: pill chip renders value + tooltip reachable by role; field chip renders name+value; tone classes differ (assert via accessible content and title text, not class names)
- [ ] Implement cva chip; run test file green; package typecheck
- [ ] Stories per variant; commit `feat(ui-kit-chat): one Chip, cva variants over unocss literals`

### Task 3: CodeBlock + DiffBlock

**Files:**

- Create: `packages/ui-kit-chat/src/tools/styled/code-block.tsx`
- Modify: `tool-presentation.ts` (CODE_BLOCK_CLASS/OPTIONS stop being exported once all consumers migrate; final deletion in Task 11)
- Test: story-level (play asserts rendered code text visible per size)

**Interfaces:**

- Produces:
  ```ts
  export function CodeBlock(props: {
    file: {name: string; lang: string; contents: string}
    size?: 'xs' | 'sm'
    maxHeight?: 'result' | 'log'
    class?: string
  }): JSX.Element
  export function DiffBlock(props: {
    file: FileOptions<undefined> extends never ? never : {name: string; before: string; after: string; lang?: string}
    size?: 'xs' | 'sm'
    class?: string
  }): JSX.Element
  ```
  (Exact solid-diffs prop shapes: agent reads SolidCodeBlock/SolidFileDiff signatures and mirrors them; the size/maxHeight variants are cva. The 7 existing local variants map onto these two components + variants; where a local variant had a genuinely different max-height, `maxHeight` covers it — no per-card overrides survive.)

**Steps:**

- [ ] Implement both with cva size variants; stories showing xs/sm and long-content scroll
- [ ] Package typecheck + storybook test file for the new stories green
- [ ] Commit `feat(ui-kit-chat): CodeBlock and DiffBlock retire per-card code-block styling`

### Task 4: ErrorBlock + status vocabulary + duration

**Files:**

- Create: `packages/ui-kit-chat/src/tools/styled/error-block.tsx`, `packages/ui-kit-chat/src/tools/primitives/status-visual.tsx`
- Modify: `tool-card.tsx` (DOT map -> status-visual), `inline-row.tsx` (StatusIcon -> status-visual), `tool-fallback.tsx` (STATUS_ICON + formatToolDuration -> shared), `tool-util.ts` (formatDuration stays the single formatter)
- Test: `packages/ui-kit-chat/test/status-visual.browser.test.tsx` (new); existing tool-card/fallback tests keep passing

**Interfaces:**

- Produces:
  ```ts
  export function ErrorBlock(props: {message: string; label?: string; class?: string}): JSX.Element
  export function StatusVisual(props: {status: ToolStatus; form: 'dot' | 'icon'}): JSX.Element
  export function formatDuration(ms: number): string
  ```
  StatusVisual builds on ui-kit-system StatusDot for `form: 'dot'`; `form: 'icon'` covers InlineRow/fallback check/spinner/cross. todo-card's three maps collapse onto it in Task 8.

**Steps:**

- [ ] Failing test: StatusVisual renders distinguishable accessible states (role/img aria-labels per status), ErrorBlock shows label+message
- [ ] Implement; consumers inside ui-kit-chat switch; run ui-kit-chat suite green; typecheck
- [ ] Commit `feat(ui-kit-chat): one status vocabulary, one error block, one duration formatter`

### Task 5: ActionRow + CollapsibleSection

**Files:**

- Create: `packages/ui-kit-chat/src/tools/styled/action-row.tsx`, `collapsible-section.tsx`
- Modify: `permission-card.tsx`, `tool-fallback.tsx` (drop local BTN/ALLOW/DENY, consume ActionRow)
- Test: extend `collapsible-card-shape.browser.test.tsx` sibling: `collapsible-section.browser.test.tsx` (nested expand/collapse via getByRole button + aria-expanded)

**Interfaces:**

- Produces:
  ```ts
  export function ActionRow(props: {children: JSX.Element; class?: string}): JSX.Element
  export function ActionButton(
    props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {intent?: 'allow' | 'deny' | 'neutral'},
  ): JSX.Element
  export function CollapsibleSection(props: {
    header: JSX.Element
    defaultOpen?: boolean
    children: JSX.Element
    class?: string
  }): JSX.Element
  ```
  ActionButton wraps ui-kit-system Button with cva intent variants matching today's ALLOW/DENY visuals exactly. CollapsibleSection is Ark Collapsible with the card's chevron/typography, for nested in-card structure (PR 2's consumer).

**Steps:**

- [ ] Failing tests; implement; permission-card + fallback re-expressed; ui-kit-chat suite green; typecheck
- [ ] Commit `feat(ui-kit-chat): ActionRow and CollapsibleSection join the tool vocabulary`

### Task 6: CardShell + cardHeader lift; MetaToolCard re-expressed

**Files:**

- Create: `packages/ui-kit-chat/src/tools/styled/card-shell.tsx`
- Modify: `meta-tool-card.tsx` (header via CardShell; local CATEGORY_ACCENT/SUMMARY/HINT stay local), `packages/extensions/page/src/client/cards/shared.tsx` (CardShell/cardHeader/detailChips now imported from the kit; local copies deleted), all six page cards' imports
- Test: existing meta-tool-card stories + page card stories keep passing unchanged (pixel bar)

**Interfaces:**

- Produces:
  ```ts
  export function CardShell(props: {
    meta: ToolViewMeta | undefined
    title: string
    metaBadge?: string
    part: ToolCardProps['part']
    result: ToolCardProps['result']
    durationMs?: number
    children?: JSX.Element
  }): JSX.Element
  export function cardHeader(props: ToolCardProps): {
    meta: () => ToolViewMeta | undefined
    phase: () => CardPhase
    title: () => string
  }
  export function detailChips(
    meta: {inputSchema?: unknown} | undefined,
    input: Record<string, unknown>,
    skip?: ReadonlySet<string>,
  ): Array<{name: string; value: string}>
  ```
  detailChips' default skip set becomes empty (page passes its ELEMENT_TARGET_KEYS explicitly).

**Steps:**

- [ ] Lift; re-express MetaToolCard; page package + ui-kit-chat typecheck; page card stories + meta stories green
- [ ] Commit `feat(ui-kit-chat): CardShell lifts the meta-driven header into the kit`

### Task 7: Convention enforcement

**Files:**

- Modify: `packages/ui-kit-chat/src/tools/index.tsx` — CollapsibleCard is NOT exported from the subpath (internal to the kit; cards compose CardShell/ToolCard). InlineRow stays exported.
- Create: lint rule `conciv/tool-card-shell` in the repo's oxlint jsPlugins location (find via `.oxlintrc` / existing conciv/no-comments rule) forbidding `CollapsibleCard` imports outside `packages/ui-kit-chat/src/tools/`
- Modify: consumers that imported CollapsibleCard directly get migrated FIRST (Task 8 covers bash/apply-patch/file-read/todo) — this task lands AFTER Task 8 in commit order if needed; agent verifies zero remaining importers before flipping the export

**Steps:**

- [ ] Verify zero external CollapsibleCard importers (grep); drop export; add lint rule with a fixture test mirroring how existing conciv rules are tested
- [ ] Full lint green; commit `chore(lint): tool cards compose CardShell, never CollapsibleCard`

### Task 8: Migrate ui-kit-chat-tools builtins (9 cards) + delete ToolChip

**Files:**

- Modify: all of `packages/ui-kit-chat-tools/src/styled/tools/*.tsx`: bash, apply-patch-diff, file-read, todo move onto ToolCard/CardShell (regaining status dot, duration, auto-open-on-approval); every local code-block constant pair -> CodeBlock/DiffBlock; ToolChip consumers -> Chip kind="pill"; todo's status maps -> StatusVisual; file-read's mono fallback -> Chip
- Delete: `tool-chip.tsx`
- Test: `packages/ui-kit-chat-tools/test/*` updated only where DOM changed structurally (status dot now present on 4 cards — assertions may need the new role); stories updated

**Steps:**

- [ ] Migrate card-by-card, running the package suite after each; typecheck
- [ ] Orchestrator screenshot pass: before/after per card, pixel-identical EXCEPT the four cards gaining the status dot/duration (expected delta, documented in PR)
- [ ] Commit `refactor(ui-kit-chat-tools): builtins compose the kit vocabulary`

### Task 9: Migrate tools/core/app cards + testkit

**Files:**

- Modify: `packages/tools/src/cards/ui-card.tsx` (local DIFF pair -> DiffBlock; six local layout constants -> ActionRow/kit equivalents where they exist, remaining truly-local layout stays), `packages/core/src/cards/code-run-card.tsx` (ResultChip -> Chip pill, ErrorBox -> ErrorBlock, console eyebrow stays local), `apps/conciv/src/pane/tool-fallback-card.tsx` (re-express or delete in favor of kit fallback — agent decides by reading what it adds; deletion preferred if kit fallback covers it, update chat-pane), `packages/extension-testkit/src/card-harness.tsx` (subpath imports only; shape unchanged)
- Test: app dispatch test, ui-card stories, code-run stories keep passing

**Steps:**

- [ ] Migrate; package typechecks; affected test files green
- [ ] Commit `refactor(tools,core,app): cards compose the kit vocabulary`

### Task 10: Migrate extensions (tanstack, recorder, whiteboard) + meta labels

**Files:**

- Modify: `packages/extensions/tanstack/src/tool/card-shared.tsx` (InspectionCard/ActionCard re-expressed on CardShell; CardRows/CardRow/CardNote -> NoteRow/kit rows; CardErrorBlock -> ErrorBlock) + 11 cards (ToolChip -> Chip pill); `packages/extensions/tanstack/src/tool/*/def.ts` files gain `meta.icon` + real `meta.label` entries (11 tools; labels written running/done per the existing page defs pattern)
- Modify: `packages/extensions/recorder/src/tool/card.tsx` (danger div -> ErrorBlock; action rows -> NoteRow/Chip)
- Modify: `packages/extensions/whiteboard/src/tool/canvas/card.tsx`, `comment/card.tsx`, `card-util.ts` (danger divs -> ErrorBlock; ToolChip -> Chip pill; toolPayload/failureOf folded into kit `parseResultPayload` extension for image+JSON, new export `parseResultMedia` in the kit returning `{json: unknown; imageUrl?: string}`; blessed `ResultImage` component in the kit for the img rendering)
- Create: `packages/ui-kit-chat/src/tools/primitives/result-media.ts` + `styled/result-image.tsx`
- Test: extension card tests via testkit harness updated; tanstack/recorder suites green locally; whiteboard typecheck/lint only (CI-only suite)

**Interfaces:**

- Produces: `parseResultMedia(result: ToolResultPart | undefined): {json: unknown; imageUrl?: string}`; `ResultImage(props: {src: string; alt: string; class?: string})`

**Steps:**

- [ ] Migrate per extension; typechecks; tanstack/recorder/test-runner-adjacent suites green; whiteboard evidence deferred to CI
- [ ] Commit per extension: `refactor(tanstack): ...`, `refactor(recorder): ...`, `refactor(whiteboard): ...`

### Task 11: Final sweep + gates

**Steps:**

- [ ] Grep-verify zero remaining: local code-block constant pairs, danger-block class strings, ToolChip references, status maps outside status-visual, CollapsibleCard external imports, root tool exports on ui-kit-chat index
- [ ] Delete now-unconsumed exports (fallow dead-code trace each before deleting); tool-presentation drops CODE_BLOCK_CLASS/OPTIONS exports
- [ ] Orchestrator: full typecheck, lint, format, forced suites (all touched packages + storybook + app + embed), fallow 0 introduced, full screenshot pass
- [ ] Open PR 1 based on feat/tool-cards, body links spec + report artifact
- [ ] Commit `chore(cards): retire the last legacy card vocabulary`

## PR 2 — test-runner re-skin (branch `feat/test-runner-card-reskin` off PR 1)

### Task 12: Port test-runner card onto kit vocabulary

**Files:**

- Modify: `packages/extensions/test-runner/src/tool/card.tsx` — all 18 `pw-*` constants replaced: card frame -> CardShell (meta-driven icon/title; def.ts already has `icon: 'script'`, add label), per-file and per-test collapse -> CollapsibleSection, pills -> Chip tones (success/danger/neutral), running dot -> StatusVisual, error block -> ErrorBlock + CodeBlock, action buttons -> ActionRow/ActionButton
- Delete: the `pw-*` utilities from wherever they are defined (uno config or preset — agent traces and removes if test-runner was the only consumer; fallow-verify)
- Test: `packages/extensions/test-runner/test/test-card.browser.test.tsx` updated for new roles; stories showing pass/fail/running/nested-expand states

**Steps:**

- [ ] Migrate keeping the nested-collapse UX exactly (file rows collapse test lists, failing tests expand to error+actions)
- [ ] Package suite + typecheck green; stories green
- [ ] Orchestrator: screenshot set for user approval (this PR is a deliberate visual change)
- [ ] Commit `refactor(test-runner): card joins the chat design system`; open PR 2 based on PR 1

## Self-review (done)

- Spec coverage: subpath (T1), cva+Chip (T2), CodeBlock/DiffBlock (T3), ErrorBlock/status/duration (T4), ActionRow/CollapsibleSection (T5), CardShell (T6), convention+lint (T7), migrations (T8-10), meta.labels (T10), image+JSON payload (T10), sweep inventory consumers: chat-pane/tool-fallback-card/testkit (T9), collect-client needs no change beyond types (T1 ripple), ios only consumes types (no task needed, T1 typecheck covers), completeness sweep (T11), test-runner (T12), auto-open restored (T8 via shell adoption). No gaps.
- Placeholders: none; contract signatures given verbatim; implementation bodies are deliberately dispatch-owned per repo rules.
- Type consistency: Chip kind/tone, StatusVisual form, CardShell props match across tasks.
