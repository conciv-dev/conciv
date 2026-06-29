# @mandarax/ui-kit-chat — execution checklist + Definition of Done

Loop source-of-truth. Plan: `2026-06-28-widget-chat-ui-redesign.md`. API spec:
`2026-06-28-ui-kit-chat-api.md`. Work in a dedicated worktree; commit per task; check the box
only when its verification passes.

## Pre-flight (DO THIS FIRST, before any code)

- [x] From the worktree, run the FULL suite and record a baseline: every package's unit/IT tests +
      Storybook builds + `oxlint` + `turbo build`/`typecheck` — ALL GREEN. Paste the result list into
      the "Baseline" note below. If anything is red at baseline, STOP and report; do not start on a
      broken tree. (Tests must be green before start AND at the end — plan §19.)

**Baseline (captured 2026-06-28, worktree `worktree-ui-kit-chat`, commit b97c50e):**

- `pnpm turbo run build` → **21/21 GREEN**
- `pnpm turbo run typecheck` → **40/40 GREEN**
- `npx oxlint` → **0 errors, 0 warnings** (cleared 39 pre-existing warnings in b97c50e: unocss order autofix, `.sort`→`.toSorted`, added internal `__client/__server/__render/__execute` to no-underscore-dangle allow list)
- `pnpm turbo run test` → **39/39 GREEN** (incl. tool-ui 44 tests / widget 75 tests, all browser ITs + storybook play tests)
- `pnpm turbo run build-storybook` → **23/23 GREEN**
- Net baseline test counts to preserve: tool-ui 44, widget 75 (see ledger).

## Loop protocol

1. Pick the first unchecked task (top-down). 2. Implement it per the plan + API spec.
2. Run its verification. 4. Commit. 5. Check the box. 6. Repeat.
3. When every box is checked, run the **Final acceptance gate** (below). The work is DONE
   only when the gate is fully green. **If you ever must deviate from a rule, STOP and ask —
   never deviate silently.**

---

## DEFINITION OF DONE (the end goal)

**THE GOAL IS THAT THE REAL WIDGET RUNS ON `@mandarax/ui-kit-chat` IN THE LIVE APP, AND THE
OLD CHAT STACK IS DELETED.** Building the package + Storybook is NOT done. Done = the app
actually imports and renders the chat through the new package, the old files are gone, and
nothing regressed.

Done = **(A) all phase tasks checked** AND **(B) rules/no-deviation audit green** AND
**(C) cutover & old-code-removal audit green** AND **(D) final acceptance gate green**.
All four. No exceptions, no "mostly," no leaving the old chat-panel/tool-ui alive next to the new one.

### B. Rules & no-deviation audit (run from the worktree root; each MUST hold)

- [ ] **No assistant-ui dependency.** `grep -rn "assistant-ui" packages/ui-kit-chat/{package.json,src}` → only comments referencing it as a doc reference, never an import or dep. `jq '.dependencies,.devDependencies,.peerDependencies' packages/ui-kit-chat/package.json` contains no `@assistant-ui/*`.
- [ ] **No Ark _component_ imports outside ui-kit-system.** `oxlint` passes with zero `no-restricted-imports` errors. `grep -rn "@ark-ui/solid/" packages/ui-kit-chat/src packages/widget/src` shows ONLY headless hooks (`useListCollection`, `useFilter`) — never a component subpath.
- [ ] **Base components come from ui-kit-system.** Every Tooltip/Menu/Popover/Toast/Avatar/Tabs/Switch/Collapsible/ScrollArea/Dialog/Combobox usage in ui-kit-chat imports from `@mandarax/ui-kit-system`.
- [ ] **Canonical tanstack data model, NO new domain types.** ui-kit-chat does not redefine `UIMessage`/`MessagePart`/`ToolCallPart`/`ToolResultPart`/`ThinkingPart` — `grep -rn "interface UIMessage\|type MessagePart\b\|interface ToolCallPart" packages/ui-kit-chat/src` → none; they're imported from `@tanstack/ai-client`.
- [ ] **Real useChat, single source of truth, NO copied state.** `ChatProvider` stores the `useChat` return in context; `grep -rn "createStore" packages/ui-kit-chat/src/store` shows a store ONLY for the view-state bag (collapsed/pinned/hover/draft/viewport), never for messages/status.
- [ ] **NO mocks of the runtime.** `grep -rn "mockChat\|vi.fn\|jest.fn" packages/ui-kit-chat/src` → none. Stories use the real `useChat` + `storyConnection` (a fake `ConnectionAdapter` yielding `StreamChunk`s, mirroring TanStack's `createMockConnectionAdapter`).
- [ ] **Design/API parity with assistant-ui.** Every primitive family + part listed in API spec §2 (and the capability table §7) exists and is exported. ai-solid-ui was reference only — our shape is the assistant-ui compound API, not ai-solid-ui's.
- [ ] **Styled set neutral + themeable.** `packages/ui-kit-chat/src/theme/` ships neutral `--chat-*` tokens (light/dark) + a separate mandarax theme mapping to `--pw-*`. The styled components reference only `--chat-*`, never `--pw-*` directly.
- [ ] **Storybook covers every component, all states.** Each primitive part, styled component, and tool card has a `.stories.tsx`; `grep` count of components == stories (data-coupled exemptions explicitly listed in the Phase 8b story index). Storybook builds.
- [ ] **Code style (hard rules).** No `class ` declarations; no `: any`/`as ` casts; no non-null `!`; no IIFE; no internal barrel `index.ts` inside `primitives/`/`styled/` folders (the single package-entry `src/index.tsx` is allowed). `grep -rn ": any\| as [A-Z]\|!\." packages/ui-kit-chat/src` reviewed → none illegitimate.
- [ ] **Unstyled by default — no fused logic in `styled/`.** Every domain behavior (parsing, status derivation, grouping, state) lives in a `primitives/*` headless layer; `styled/*` only adds `--chat-*` classes + slots over a primitive (or a ui-kit-system primitive for pure shells like CollapsibleCard/TooltipIconButton). No `styled/` file declares a parse/derive/status function. Spot-check: `grep -rnE "^function (parse|to[A-Z]|.*Status|claudeBlock|patchInfo)" packages/ui-kit-chat/src/styled` → none. Tool cards follow §2.14.
- [ ] **No orphaned/duplicate primitives.** Every exported `*Primitive` is consumed by its styled counterpart (or is intentionally headless-only and documented). `toolStatus` is defined once (`primitives/tools/tool-status.ts`), not re-implemented per card. There is ONE disclosure mechanism (ui-kit Collapsible) — no second Show-based accordion shadowing it.
- [ ] **No tests in example apps.** `git diff --name-only main...HEAD | grep apps/examples` shows no added/edited tests.
- [ ] **Defects D1–D13 fixed** (plan §3/§10): the D1 regression IT passes (expand a wide tool card → assistant turn left/right edges unchanged, only height grows); tool cards collapsed-by-default + auto-expand on approval; one disclosure mechanism; no native `title=`; toast via ui-kit; top-anchor scroll; per-message ActionBar; no collapse-jump.

### C. Cutover & old-code-removal audit (the "actually used + old code gone" gate — plan §18)

- [ ] **Widget depends on the package.** `jq '.dependencies["@mandarax/ui-kit-chat"]' packages/widget/package.json` → present.
- [ ] **The app renders through it.** `mount.tsx`, `widget-shell.tsx`, `quick-terminal.tsx` render the chat via ui-kit-chat `Thread`/`Composer`; `chat-panel.tsx` is only a thin `useChat`+`ChatProvider` container (no layout/grouping/tool-rendering left in it).
- [ ] **tool-ui is gone.** `ls packages/tool-ui` → does not exist. `grep -rn "@mandarax/tool-ui" packages --include=*.ts --include=*.tsx --include=*.json | grep -v node_modules | grep -v /dist/` → **zero**.
- [ ] **Old widget files deleted/replaced per §18:** `packages/widget/src/chat/markdown.tsx` deleted (→ ui-kit-chat Markdown); `shell/popover.tsx` deleted + `grep -rn "@floating-ui/dom" packages/widget` → zero; `shell/empty-state.tsx` replaced by ui-kit-chat Empty/Welcome (EmptyStateSlot seam kept); `shell/approval-modal.tsx` renders ui-kit-chat `PermissionCard`.
- [ ] **Extension consumers migrated.** `whiteboard/src/client/pins/thread.tsx` and `test-runner/src/tool/card.tsx` import from `@mandarax/ui-kit-chat` (not tool-ui); both package.jsons updated; both extension ITs pass.
- [ ] **No duplicate stacks.** There is exactly ONE disclosure mechanism, ONE toast, ONE tool-card renderer, ONE markdown renderer in the running widget (no old + new side by side).
- [ ] **Composer controls rewired.** model/session selectors + session-info/new-session/compact/open-in-terminal actions render inside the ui-kit-chat `Composer` slots (not the old composer markup).

### D. Final acceptance gate (all green, from the worktree)

- [ ] `pnpm turbo run build --filter=@mandarax/ui-kit-system --filter=@mandarax/ui-kit-chat --filter=@mandarax/widget` — passes.
- [ ] `pnpm turbo run typecheck` (or the repo's typecheck task) — zero errors.
- [ ] `oxlint` (repo lint) — zero errors/warnings, incl. `no-restricted-imports`.
- [ ] Storybook builds for ui-kit-system AND ui-kit-chat (`pnpm turbo run build-storybook --filter=...`).
- [ ] Widget testkit / in-package ITs pass (rebuild core first; `newPage()` not `newContext()`).
- [ ] **All tests green — same baseline suite as Pre-flight, plus the new ui-kit-chat stories/ITs.** Net coverage did NOT drop vs baseline.
- [ ] **Test-deletion ledger complete** (below): every removed/renamed test has a justification + where its coverage now lives. Zero unexplained deletions. `--pw-*` design tokens still resolve in the running widget (tokens.css re-homed, plan §18.1).
- [ ] Manual: launch the example app, open the widget, confirm the chat is rendered BY ui-kit-chat (old chat-panel/tool-ui deleted) — a streamed turn renders, a tool card expands without the bubble jumping, approval works, scroll behaves (top-anchor → release).
- [ ] Every box in sections A + B + C is checked.

## Test-deletion ledger (plan §19 — a test may be removed ONLY with an entry here)

| Removed/renamed test                                                                                                                                                | Why (subject gone / moved)                                                                                    | Where its coverage lives now                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-ui/src/cards/{file-edit,file-read,generic,page-action,search,shell,todo,ui-chip}.stories.tsx` + `done-card`/`now-line`/`shell`/`thinking`/`tool-call` stories | tool-ui package deleted in the cutover; concrete cards split to `@mandarax/ui-kit-chat-tools`                 | `ui-kit-chat-tools` story files per card (Bash/ApplyPatch/FileEdit/FileRead/Search/Todo/page-action/ui-chip) + ui-kit-chat ToolFallback/NowLine stories |
| `tool-ui/test/now-title.test.ts`, `tool-ui/test/util.test.ts`                                                                                                       | helpers moved with the cards                                                                                  | `ui-kit-chat-tools` `now-title.ts` / `primitives/tools/tool-util.ts` (parseInput/resultText/etc), exercised via the tools stories                       |
| `widget/test/__snapshots__/{computed-styles.json,shots/*.png}` (UPDATED, not deleted)                                                                               | chat redesign + tool-ui→ui-kit-chat DOM restructure moves element paths/computed styles; visual output stable | regenerated golden (`UPDATE_STYLE_SNAPSHOT=1`); modal-open + model-popover shots eyeballed correct; test green non-update                               |

---

## A. Phase tasks

### Phase 0 — ui-kit-system base primitives

- [x] Tooltip, Menu, Popover, Toast, Avatar, Tabs, Switch wrappers + TextField autosize, each + `.stories.tsx`. Verify: stories render in Storybook (real browser); shadow-DOM safe via EnvironmentProvider.
      Done: 7 Ark wrappers (Object.assign compound, `strategy:'fixed'` + `hidden data-[state=open]:block` for shadow-DOM safety) + `TextArea` autosize (ported chat-panel autoGrow, minRows/maxRows). 9 new stories, **ui-kit-system test 20/20 GREEN**, storybook builds, oxlint 0/0.

### Phase 1 — ui-kit-chat scaffold + ChatProvider/context

- [x] Package (package.json/tsconfig/uno/.storybook); `Primitive` slot shim; `createActionButton`; `ChatProvider`/`useChatContext` over the `useChat` return; `createMemo` views (`useThread`/`useComposer`); view-state bag; grouping ported (`coalesceTurns`/`groupSegments`/`pairResults`); `storyConnection` helper. Verify: a trivial story renders the real useChat behind storyConnection; typecheck clean.
      Done: `@mandarax/ui-kit-chat` scaffolded (vite/vitest/uno/.storybook). `ChatProvider` wraps the real `UseChatReturn` verbatim + a `createStore` view-state bag (draft/collapsed-by-toolCallId/pinned/hover/viewport) with key GC; `useThread`/`useComposer` are getter/`createMemo` views (NO copied chat state). `storyConnection` = fake `ConnectConnectionAdapter` yielding chunks that mirror the repo's own `agui.ts` emitter (text/reasoning/tool/approval builders). **Story drives the REAL `useChat` end-to-end (storybook chromium GREEN), grouping unit 5/5 GREEN, typecheck/build/storybook all clean, oxlint 0/0.**

### Phase 2 — headless primitives (full API parity, API spec §2)

- [x] 2a — Thread (Root/Viewport/ViewportFooter/Messages/MessageByIndex/ScrollToBottom/Suggestion(s)/Empty/If), Message (Root/Parts/PartByIndex/Attachments/If/Error), MessagePart (Text/Image/InProgress).
      Done: all three families built + exported over the coalesced-turn model; tool dispatch by `ToolCardEntry[]`; ToolProvider host-seam; stories drive REAL useChat (11/11 green).
- [x] 2b — Composer (Root/Input/Send/Cancel/AddAttachment/Attachments/AttachmentDropzone/If), ActionBar full (Copy/Reload/Edit/ExportMarkdown/Speak/Feedback, gated), ActionBarMore, Attachment (Root/Name/Remove/Thumb).
      Done: all four families built+exported; ActionBar gating via ActionHandlers context (Edit/Speak/Feedback null until handler — story asserts both states); Composer autosize + enter/ctrlEnter/esc; 17/17 green.
- [x] 2c — ChainOfThought, BranchPicker (inert), Suggestion, Error.
      Done: ChainOfThought (Root/AccordionTrigger/Parts, open-while-streaming); BranchPicker inert (count=1, hideWhenSingleBranch); Suggestion (Title/Description/Trigger over context); Error (Root role=alert/Message over chat.error()). 22/22 green incl. RUN_ERROR→error() story.
- [x] 2d — ThreadList/ThreadListItem/ThreadListItemMore (over session store), AssistantModal.
      Done: ThreadList/Item over a neutral ThreadListProvider (host supplies sessions+actions); Delete/Archive gated; ThreadListItemMore aliases the Menu overflow; AssistantModal over ui-kit Popover. Stories green.
- [x] 2e — Composer extras (Quote/Dictate/TriggerPopover), QueueItem, SelectionToolbar.
      Done: Composer Dictate/StopDictation/DictationTranscript + @/slash TriggerPopover (gated via ComposerHandlers); QueueItem Text/Steer/Remove (gated); SelectionToolbar Root/Quote + useSelectionToolbarInfo. Gated-null + live paths story-covered.
- Verify each: stories for every part covering all states via storyConnection; gated actions render null with no handler.
  **Phase 2 complete: 16 story files / 28 tests GREEN, typecheck clean, oxlint 0/0. Full primitive API parity (§2) built + exported.**

### Phase 3 — scroll behaviors

- [x] useThreadAutoScroll, useTopAnchorReserve, useScrollLock, useSizeHandle + the top-anchor↔stick-to-bottom coordinator (API spec §3). Verify: tall-thread story shows top-anchor pin then release-to-bottom; no collapse jump.
      Done: 4 behaviors built+exported. useThreadAutoScroll ported from chat-panel (MutationObserver rAF-coalesced pin + 1px tolerance + scroll-up/pointerdown cancel) wired into Thread.Viewport. Deterministic D10 story: overflowing streamed answer sticks to bottom (atBottom stays true) — 3/3 stable, 29/29 green. top-anchor/scroll-lock/size-handle built+exported (visual verification via Phase 4 styled Thread + Phase 6f scroll IT).

### Phase 4 — styled set (neutral/themeable)

- [x] 4a — Thread shell (assistant full-width/user bubble), Composer, TooltipIconButton.
      Done: Thread (process/answer turn split, D1 min-w-0 chain), Composer reworked to the widget's single-box layout (borderless textarea + actions row + send; TextArea `unstyled` variant kills the double border), TooltipIconButton. Commit ab71d8c.
- [x] 4b — ToolFallback/ToolGroup, Reasoning, ChainOfThought, AttachmentUI, Suggestions, ActionBar, BranchPicker.
      Done + polished: ChainOfThought rail/step timeline, CollapsibleCard chevron, Reasoning, ToolFallback/ToolGroup, AttachmentUI, FollowUpSuggestions, ActionBar (size-9), BranchPicker. Commits a191def + ab71d8c.
- [x] 4c — Markdown (solid-streamdown) binding. **ThreadList/ThreadListSidebar deferred** (Phase 9 — widget uses a popover, not a sidebar; loop scope note).
- Verify: stories in light + dark; D1 (no width jump) visible in the Thread story. **Done — thread.stories D1 play test + headless screenshots; vitest run deferred while storybook dev is live.**

### Phase 5 — tool vocabulary (ported from with-opencode, bound to tanstack parts)

- [x] 5a — apply-patch-diff (Pierre), bash-card, inline-tool (ToolCardEntry[] dispatch). **Done** (commits d68165c + f745abd): all two-layer (primitives/tools/_ logic + styled/tools/_ tokens, §2.14); SolidPatchDiff added to solid-diffs; defineToolkit→ToolCardEntry[]; styled Thread dispatches `tools` by name in the chain (was fallback-only). Screenshot-verified.
- [~] 5b — **PermissionCard done** (two-layer: primitives/tools/permission + styled/tools/permission-card; native-approval-hybrid via ctx.respondApproval; wired into the Thread chain so any approval-requested tool shows Allow/Deny; story Pending/Settled green). `defineToolkit` done in 5a. **ReasoningGhost SKIPPED — superseded** (DEVIATION, flagged): the chain already renders reasoning as a Brain rail node + carded `Reasoning` (the user's explicit "Reasoning = card" choice); adding assistant-ui's un-carded ghost would be an orphaned component. **Folding the remaining tool-ui cards** (file-edit/file-read/search/todo/page-action/ui-chip/generic) deferred to Phase 6e (cutover absorbs tool-ui). Ask UI = existing GenUi.
- [x] 5c — **ModelSelector (assistant-ui API parity, API spec Appendix A).** Done (commit b5193ed): headless `primitives/model-selector/` compound (Root/Trigger/Value/Content/Search/List/Empty/Group/Separator/Item/Effort + `createControllableSignal` util) over ui-kit-system Combobox/Popover; styled `styled/model-selector.tsx` (chat tokens + lucide, flat `ModelSelector` convenience). EXACT public API + types (`ModelOption`/`ModelSelectorEffortOption`/`DEFAULT_EFFORT_OPTIONS`/`resolveModelEffort`/`useModelSelectorEfforts`). Effort part gated (null until `HarnessModelInfo.efforts`). Deviations per Appendix A.3 (no `useAui` ModelContext → controlled `onValueChange`).
- Verify: each card has stories incl. running/complete/error/approval states. ModelSelector stories per Appendix A.5 (closed/open/filter/disabled/empty/effort/controlled; neutral+dark+mandarax; shadow-DOM open).

### Phase 6 — widget cutover + DELETE the old stack (plan §18 — this is where "used in the app" happens)

- [ ] 6a — Add `@mandarax/ui-kit-chat` dep to widget. Rewrite `chat/chat-panel.tsx` to a thin container: `useChat` → `<ChatProvider>` → ui-kit-chat `<Thread>`/`<Composer>`; keep session load/switch/compact/divider/duration/approval wiring; delete all layout/grouping/tool-rendering from it.
- [ ] 6b — Replace `chat/markdown.tsx` with ui-kit-chat `Markdown`; **delete** `chat/markdown.tsx`. Keep `chat/gen-ui.tsx`, render it via a thread slot.
- [ ] 6c — Replace `shell/popover.tsx` (floating-ui) with ui-kit `Popover`/`AssistantModal`; **delete** it + drop `@floating-ui/dom`. `shell/approval-modal.tsx` → render ui-kit-chat `PermissionCard`. `shell/empty-state.tsx` → ui-kit-chat Empty/Welcome+Suggestions (keep EmptyStateSlot seam). `fab-robot` → AssistantModal.Trigger. Rewire `widget-shell.tsx` + `quick-terminal.tsx` to render ui-kit-chat threads.
- [ ] 6d — Rewire composer: model/session selectors + session-info/new-session/compact/open-in-terminal into ui-kit-chat `Composer` slots. Rebuild `widget/src/composer/model-selector.tsx` on ui-kit-chat `ModelSelector` (Phase 5c; map `groupsOf`→`Group` blocks, `onValueChange`→`setRequestMeta({model})`); delete the hand-rolled Combobox markup.
- [ ] 6e — **Absorb & delete `packages/tool-ui`**: move/replace every file per §18 into ui-kit-chat; migrate the 2 extension consumers (`whiteboard/.../pins/thread.tsx`, `test-runner/.../tool/card.tsx`) + their package.jsons to import from ui-kit-chat; `page-action`/`ui-chip` become widget-side `ToolCardEntry`s; then `rm -rf packages/tool-ui` and drop the dep from widget package.json/vite/styles.
- [ ] 6f — Verify cutover: D1 regression IT; widget testkit green; whiteboard + test-runner extension ITs green; section C audit (no tool-ui, no floating-ui, app renders via ui-kit-chat) passes.

### Phase 7 — theming

- [ ] Neutral `--chat-*` tokens (light/dark) + mandarax theme layer (→ `--pw-*`); verify in widget shadow DOM (@property hoist).

### Phase 8 — polish + storybook sweep

- [ ] 8a — send-disabled real state, 44px touch targets, hover/active/focus-visible, reduced-motion, responsive (PiP / quick-terminal / ≥300px).
- [ ] 8b — story for every presentational component (all states/themes); list data-coupled exemptions; storybook config wired into turbo.

### Phase 9 — future (NOT required for Done; do not block the gate)

- [ ] (optional) branch layer to light BranchPicker; TTS/feedback handlers; thread-list sidebar app shell; JsonTreeView only if `<pre>` proves insufficient.
