# Test split: kits

Group: every test file and every story with a `play` in packages/ui-kit-chat, ui-kit-chat-tools, ui-kit-system, ui-kit-tap, ui-kit-terminal, solid-diffs, solid-streamdown, brand, brand-react and apps/storybook. Code read on the worktree aidx-wt-test-split (origin/main 86d94e743), every file in full. Plan: `docs/specs/test-rewrite-after-port.md`. Audit hints: `docs/specs/test-audit/test-audit-ui-kit-*.md`.

Group ruling applied: published kit components that only stories and tests use are kept as public API, so no row here is DELETE-TESTONLY-API. One row conflicts with plan decision 8: `Thread.Suggestions` (primitives/thread/thread.stories.tsx:118). It is kept here under the group ruling and needs a ruling.

Updated 2026-11-20 to the rulings in `docs/specs/test-rewrite-after-port.md`. Row lines are lines at `9d4f4834f`, and runner names are today's. Rows marked "gone by 9d4f4834f" test code that commit 0bc80ef1b deleted as dead code (`ModelSelector`, the permission expiry chip, FileReadCard `open`, TerminalModel `inject`, `TerminalPrimitive.Overlay` and the styled Terminal `rail`); they are `not carried`, because the feature is gone.

## Group totals (641 rows)

| destination    | rows |
| -------------- | ---- |
| story          | 429  |
| DELETE-DUP     | 55   |
| node (table)   | 40   |
| browser mode   | 31   |
| node           | 30   |
| DELETE-COVERED | 18   |
| happy-dom      | 13   |
| not carried    | 13   |
| DELETE-NOTHING | 12   |

| part                                                                              | rows | story | node | node (table) | happy-dom | browser mode | DUP | COVERED | NOTHING | not carried |
| --------------------------------------------------------------------------------- | ---- | ----- | ---- | ------------ | --------- | ------------ | --- | ------- | ------- | ----------- |
| composer (composer.browser + 11 story files)                                      | 82   | 54    | 0    | 1            | 2         | 0            | 13  | 5       | 1       | 6           |
| thread (thread.browser + 20 story files)                                          | 107  | 80    | 0    | 4            | 0         | 7            | 8   | 4       | 2       | 2           |
| cards, markdown, kit node file (+ 13 story files)                                 | 147  | 96    | 27   | 12           | 0         | 0            | 4   | 8       | 0       | 0           |
| ui-kit-chat-tools (+ 9 story files)                                               | 56   | 42    | 0    | 6            | 0         | 0            | 6   | 0       | 1       | 1           |
| ui-kit-system browser + node (+ 33 story files)                                   | 133  | 76    | 0    | 16           | 11        | 7            | 20  | 0       | 3       | 0           |
| small kits (tap, terminal, diffs, streamdown, brand, brand-react, mascot gallery) | 116  | 81    | 3    | 1            | 0         | 17           | 4   | 1       | 5       | 4           |

(Counts come from the table rows. Where a hand-written section total differs, the rows are right.) The two happy-dom rows in composer are app journeys (`apps/conciv/src/pane/pane-composer.dom.test.tsx`), owned by the app area.

What the files become (every old test file in this group is deleted; tests sit next to the code):

- Story plays carry most kit behaviour: one component in each of its states, in real Chromium.
- Node and node (table) rows go to a test beside the module they test:
  - ui-kit-chat: `src/tools/primitives/tool-row.test.ts`, `src/tools/primitives/now-title.test.ts`, `src/store/turn-rollup.test.ts`, `src/tools/styled/generic-tool-headline.test.ts`, `src/primitives/attachment/attachment-adapter.test.ts`, `src/store/run-clock.test.ts`, `src/store/session-status.test.ts`, `src/store/grouping.test.ts`, `src/store/page-session.test.ts`, `src/draft-storage.test.ts`, `src/primitives/model-selector/model-menu.test.ts`, `src/tools/styled/tool-icon.test.ts`.
  - ui-kit-chat-tools: `src/primitives/tools/apply-patch.test.ts`, `src/styled/tools/search-matches.test.ts`.
  - ui-kit-system: `src/autosize.test.ts`, `src/skins.test.ts`, `src/scripts/generated-outputs.test.ts`; happy-dom `src/clipboard.dom.test.tsx` and `src/resize.dom.test.tsx` (Decision K1).
  - ui-kit-tap: `src/index.test.ts` (Decision K2).
  - solid-diffs: `src/index.test.ts` (Decision K3) and `src/render-sync.test.ts`.
- One browser-mode file per package, only for layout, scrolling, canvas and real focus:
  - `packages/ui-kit-chat/src/ui-kit-chat.browser.test.tsx` (the virtual list and ResizeObserver tests);
  - `packages/ui-kit-system/src/ui-kit-system.browser.test.tsx` (shadow-root, cross-window and focus);
  - `packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx` (xterm);
  - `packages/brand-react/src/brand-react.browser.test.tsx`.
    These kit browser files render their components directly; no engine and no `mount` (Decision K7).
- Budget: every package stays under its source-file count. brand-react sits at its cap: 1 source file, 1 browser file.
- Nothing in this group moves to a plugin: the app shell wires `builtinToolCards` directly (apps/conciv/src/pane/chat-pane.tsx:287).
- Covers that cite the old app and embed tests (`apps/conciv/test/conciv.browser.test.tsx:<n>`, `packages/embed/test/e2e/embed.it.test.ts:558`) are lines at 9d4f4834f. Those files are deleted, so each cover holds only once the app and embed areas carry that behaviour.

Per-file tables, journeys (merge-ids), cross-file duplicates, plugin-owned tests and happy-dom notes follow, one part at a time. Merge-id prefixes: CMP composer, THR thread, CRD/MD/KCN cards/markdown/node, TLS chat-tools, SYS ui-kit-system, TAP/TRM/DIF/SD/BR small kits.

## Browser tests a story play already duplicates (plan decision 5)

These are collected from the cross-file sections below. Each such test is DELETE-DUP pointing at the play. In the small kits they are ui-kit-tap.browser:120 and :130 (rich-text-field-triggers.stories.tsx:480). The ui-kit-chat, chat-tools and ui-kit-system pairs are listed in each part's "Cross-file duplicates" section.

## Happy-dom in this group

Little here goes to happy-dom: the two app journeys above, plus ui-kit-system clipboard and resize (Decision K1). Kit behaviour is one component, so it goes to Storybook, which runs in real Chromium and already has real focus, selection and layout. Only two composer rows go to happy-dom (apps/conciv) (composer.browser:1109 refused-send blob, :1408 Escape while stopping). Each part's last section lists what looks portable but is not, and why. The blockers that keep coming up:

- tiptap/ProseMirror contenteditable (selection, beforeinput, composition)
- Ark/zag focus gating on listbox highlight
- ResizeObserver and @tanstack/virtual sizes
- scrollIntoView
- canvas (xterm)
- clipboard DataTransfer
- shadow-root focus
- Shiki/WASM highlighting

---

# Part: composer

# Part 1: ui-kit-chat composer tests and their story plays (merge prefix CMP)

Worktree /Users/omrikatz/Public/web/aidx-wt-test-split (origin/main 86d94e743). Every file below was read in full there. Line numbers are from the worktree. "conciv:N" = apps/conciv/test/conciv.browser.test.tsx, "system:N" = packages/ui-kit-system/test/ui-kit-system.browser.test.tsx. Story paths are relative to packages/ui-kit-chat/src.

Product wiring checked (git grep in the worktree):

- `apps/conciv/src/pane/pane-composer.tsx:65` `MAX_INLINE_AUTO_ACTIONS = 0`; the width-fit modes of `ComposerActionsHost` never run in the product, but `ComposerActions*` is published kit API, so their tests stay as story plays (group ruling).
- `apps/conciv/src/pane/chat-pane.tsx` passes `draftWriter`; the `draftStorage` path is kit API only (kept, story).
- `replaceAttachment` / `hasAttachment` have one product caller, `apps/conciv/src/pane/grab-staging.ts:131`.
- `HarnessModelSelector` is used by `apps/conciv/src/composer/session-model-prompt.tsx` and `packages/plugins/terminal/src/terminal-toolbar.tsx`. The styled and primitive `ModelSelector` have no product consumer (published kit, kept).
- `Suggestion` / `Thread.Suggestions` / `FollowUpSuggestions` have no product consumer (published kit, kept).
- `ElementPreview` is used by the page plugin cards (`packages/plugins/page/src/cards.tsx`, `ActCard` and `EditLiveCard`).

### packages/ui-kit-chat/test/composer.browser.test.tsx (60 tests)

| test (file:line + short title)                                                                                                    | destination    | target (package/file or owner)                                                                                                                                                              | merge-id | why (one short clause)                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 112 action bar copy: hands the message text to the clipboard                                                                      | story          | styled/action-bar.stories.tsx (CopyAndExport gets a writeText that accepts; show "Copied", not `data-copied`)                                                                               | CMP-1    | only proof the turn text reaches the clipboard; one component                                                                                     |
| 174 action bar inactive: hidden bar reachable after hover, focus kept when pointer leaves                                         | story          | styled/thread.stories.tsx PreviousTurnActionsRevealOnHover (:161)                                                                                                                           | CMP-1    | hover reveal already in that play; add Tab focus and pointer-leave; needs real :hover/focus (Chromium story)                                      |
| 190 action row: fires onClick for a neutral action button                                                                         | DELETE-NOTHING | -                                                                                                                                                                                           | -        | a button calling its handler                                                                                                                      |
| 235 assistant action bar: Tab reaches Copy without hovering                                                                       | story          | styled/thread.stories.tsx PreviousTurnActionsRevealOnHover (:161)                                                                                                                           | CMP-1    | same thread, Tab first then hover                                                                                                                 |
| 243 assistant action bar: "Copy failed" after keyboard copy refused                                                               | DELETE-DUP     | styled/action-bar.stories.tsx:47 CopyAndExport (click Copy, "Copy failed", status "Could not copy")                                                                                         | -        | same real clipboard refusal; Enter vs click is the same handler                                                                                   |
| 321 image viewer: opens outside the transformed panel, toggles actual size                                                        | story          | styled/attachment-ui.stories.tsx:75 ImageAndFileTiles (render inside a transformed frame; click Show actual size, see Fit to window)                                                        | CMP-2    | open and Show actual size already in the play; portal-out and toggle are the new steps                                                            |
| 332 image viewer: Escape and Close return focus to the tile                                                                       | story          | styled/attachment-ui.stories.tsx:75 ImageAndFileTiles                                                                                                                                       | CMP-2    | Escape half already at stories :93-95; add Enter reopen + Close                                                                                   |
| 347 image viewer: Remove drops the attachment without opening the viewer                                                          | DELETE-DUP     | styled/attachment-ui.stories.tsx:75 ImageAndFileTiles (:100-101)                                                                                                                            | -        | play removes the image tile, no dialog                                                                                                            |
| 356 image viewer: a document tile stays inert                                                                                     | DELETE-DUP     | styled/attachment-ui.stories.tsx:75 ImageAndFileTiles (:97-98)                                                                                                                              | -        | play clicks notes.pdf, asserts no dialog                                                                                                          |
| 365 image viewer: refused image says why on chip, tooltip on hover and keyboard focus, never blocks input                         | story          | styled/composer.stories.tsx (new story: composer with image adapter, upload over the limit)                                                                                                 | CMP-3    | one composer state; needs real focus for the focus tooltip, Chromium story has it (fix #969)                                                      |
| 394 image viewer: empty refusal message still says why by file name                                                               | story          | styled/composer.stories.tsx (same story, second upload)                                                                                                                                     | CMP-3    | second input to the same refusal chip                                                                                                             |
| 416 image viewer: a sent image tile opens the viewer too, no Remove                                                               | story          | styled/attachment-ui.stories.tsx (new story: tile without onRemove)                                                                                                                         | CMP-2    | AttachmentUI state with no remove; viewer src read becomes "img visible"                                                                          |
| 450 attachment only user message: sent image shows in the user turn                                                               | story          | styled/thread.stories.tsx (new story: send image content)                                                                                                                                   | CMP-4    | thread render of a user turn with an image                                                                                                        |
| 465 attachment only user message: data-URL image named "image", never by its data                                                 | story          | styled/thread.stories.tsx (same story, data-URL shape)                                                                                                                                      | CMP-4    | fix #977; same host, second content shape                                                                                                         |
| 484 chip: renders a field chip with name and value                                                                                | DELETE-DUP     | tools/styled/chip.stories.tsx:16 FieldKind                                                                                                                                                  | -        | play asserts name and value per tone                                                                                                              |
| 506 chip: clipped value revealed in a tooltip                                                                                     | DELETE-DUP     | tools/styled/chip.stories.tsx:70 PillLongValue                                                                                                                                              | -        | play hovers a clipped pill, tooltip holds the full value                                                                                          |
| 520 chip: a fitting value has no tooltip                                                                                          | DELETE-COVERED | system:1252 "leaves no dangling description on a span that never reveals anything" (TruncatedText owns the rule)                                                                            | -        | same clipped/fitting hover and aria-describedby check one layer down                                                                              |
| 654 composer actions: wide row keeps every action inline, no trigger                                                              | story          | primitives/composer/composer-actions.stories.tsx AllInline (:183, add play)                                                                                                                 | CMP-5    | width-fit needs real layout (ResizeObserver); published kit API                                                                                   |
| 667 composer actions: cap 0 keeps auto actions in the menu, runs from it                                                          | DELETE-DUP     | primitives/composer/composer-actions.stories.tsx:242 CappedDefault                                                                                                                          | -        | same cap 0, same menu run; also conciv:1963                                                                                                       |
| 690 composer actions: cap 1 shows only one auto action inline                                                                     | story          | composer-actions.stories.tsx (CappedDefault variant with maxInlineAuto 1)                                                                                                                   | CMP-5    | public `maxInlineAuto` prop, no other proof                                                                                                       |
| 703 composer actions: lowest priority collapses into the menu and runs from there                                                 | DELETE-DUP     | composer-actions.stories.tsx:201 Collapsed                                                                                                                                                  | -        | play checks aria-haspopup, aria-expanded, runs Compress from the menu                                                                             |
| 728 composer actions: pinned action stays inline while autos collapse                                                             | story          | composer-actions.stories.tsx PinnedOnly (:284, add play)                                                                                                                                    | CMP-5    | story exists without a play                                                                                                                       |
| 741 composer actions: leading region charged against the fit budget                                                               | story          | composer-actions.stories.tsx (new story with a leading toggle)                                                                                                                              | CMP-5    | real widths                                                                                                                                       |
| 767 composer actions: inline-only action hidden when collapsed, no trigger                                                        | story          | composer-actions.stories.tsx (narrow frame with an Inline-only action)                                                                                                                      | CMP-5    | real widths; public `ComposerActions.Inline`                                                                                                      |
| 782 composer actions: item-only action in the menu even when wide                                                                 | story          | composer-actions.stories.tsx MenuOnlyAction (:301, add play)                                                                                                                                | CMP-5    | story exists without a play                                                                                                                       |
| 800 composer actions: multi-item action contiguous and ordered by priority                                                        | DELETE-DUP     | composer-actions.stories.tsx:201 Collapsed (menu order New session, Compress, Canvas, Open, Copy) and :318 PairedMenuItems                                                                  | -        | plays assert the exact ordered, contiguous menu                                                                                                   |
| 824 composer actions: disabled action disabled in both renderings, ArrowDown skips its item                                       | story          | composer-actions.stories.tsx:361 DisabledAction (add ArrowDown skip)                                                                                                                        | CMP-6    | play already has disabled inline + aria-disabled item; keyboard skip is the new step                                                              |
| 861 composer actions: widening closes the menu and calls onOverflowDismissed                                                      | story          | composer-actions.stories.tsx (story with a width toggle)                                                                                                                                    | CMP-5    | real resize; the product wires onOverflowDismissed to focus the input                                                                             |
| 925 composer attachment ops: addAttachment resolves the id                                                                        | story          | primitives/composer/composer.stories.tsx (new story: tiles + buttons Add, Replace, Remove)                                                                                                  | CMP-7    | context API made visible through story buttons                                                                                                    |
| 934 composer attachment ops: hasAttachment false after remove                                                                     | story          | primitives/composer/composer.stories.tsx                                                                                                                                                    | CMP-7    | same story                                                                                                                                        |
| 944 composer attachment ops: replaceAttachment swaps in place, keeps position                                                     | story          | primitives/composer/composer.stories.tsx                                                                                                                                                    | CMP-7    | only proof of in-place replace (grab-staging.ts:131 relies on it)                                                                                 |
| 956 composer attachment ops: replace after remove is a no-op                                                                      | story          | primitives/composer/composer.stories.tsx                                                                                                                                                    | CMP-7    | same story                                                                                                                                        |
| 1043 composer completion: typed draft persists into draftStorage                                                                  | story          | primitives/composer/composer.stories.tsx (new story: draft over a story storage, remount button)                                                                                            | CMP-8    | `draftStorage` is kit API the product does not use                                                                                                |
| 1059 composer completion: every change goes to the draft writer with its files, storage untouched                                 | DELETE-COVERED | conciv:567 (per-edit writes on this device then the engine) and conciv:595 (draft with its image comes back)                                                                                | -        | the real writer proves per-edit writes and the File                                                                                               |
| 1095 composer completion: restores a stored draft and quote on mount                                                              | story          | primitives/composer/composer.stories.tsx                                                                                                                                                    | CMP-8    | storage restore incl. quote; conciv:553 restores text but not a quote                                                                             |
| 1107 composer completion: a host blob reference survives a refused send                                                           | happy-dom      | apps/conciv/src/pane/pane-composer.dom.test.tsx (app area) apps/conciv: rejected-send journey (conciv:1221 rewritten in happy-dom): attach image, send refused, remount, image still staged | CMP-9    | fix #986 on the send path; visible as the image surviving; no layout needed                                                                       |
| 1137 composer completion: draft restored when the send handler rejects                                                            | DELETE-COVERED | conciv:1221 "a rejected send keeps the draft in the composer, tells the user why"                                                                                                           | -        | same promise end to end                                                                                                                           |
| 1157 composer completion: run error after accept leaves the composer empty                                                        | DELETE-COVERED | conciv:1270 "a turn the engine started that fails before any reply keeps the message"                                                                                                       | -        | same promise end to end                                                                                                                           |
| 1212 composer completion: items API (same key keeps first, update/remove, snapshot/restore, failed send, reload, items-only send) | story          | primitives/composer/composer.stories.tsx (draft story; items driven by story buttons, shown as text)                                                                                        | CMP-8    | kit composer contract; split the long test into the journey steps                                                                                 |
| 1279 composer completion: note staged while attachments finish stays staged after send                                            | story          | primitives/composer/composer.stories.tsx (held text adapter, a fake)                                                                                                                        | CMP-8    | race inside the kit composer; one component                                                                                                       |
| 1323 composer completion: undecodable stored item dropped; no send handler keeps items, items alone cannot send                   | story          | primitives/composer/composer.stories.tsx                                                                                                                                                    | CMP-8    | storage restore edge, same draft story                                                                                                            |
| 1370 send morph: Send when idle, Stop while running                                                                               | DELETE-DUP     | styled/composer.stories.tsx:39 Idle and :48 StreamingAlwaysShowsStopAndQueuesOnEnter                                                                                                        | -        | plays assert Send idle, Stop busy, no Send                                                                                                        |
| 1387 send morph: typing during a run keeps Stop; Stop click ends the run, text kept                                               | DELETE-DUP     | styled/composer.stories.tsx:48 StreamingAlwaysShowsStopAndQueuesOnEnter (typing keeps Stop)                                                                                                 | -        | stop-click half covered by conciv:1507 and conciv:1662                                                                                            |
| 1406 send morph: Escape while stopping passes through, stop requested once                                                        | happy-dom      | apps/conciv/src/pane/pane-composer.dom.test.tsx (app area) apps/conciv stop journey (conciv:4453 Stopping control)                                                                          | CMP-10   | fix #848; rewrite to what the user sees (Escape reaches the shell, one Stopped line) instead of `defaultPrevented`; keyboard only, happy-dom fine |
| 1698 element preview: replays a capture into a sandboxed replica, target marker and value kept, inert                             | story          | tools/styled/element-preview.stories.tsx:68 FullCapture                                                                                                                                     | CMP-11   | needs a real sandboxed iframe; play today only checks the img is visible                                                                          |
| 1712 element preview: capture wrapped in a Solid store proxy replays                                                              | story          | tools/styled/element-preview.stories.tsx (FullCapture variant with createStore)                                                                                                             | CMP-11   | second input, same asserts                                                                                                                        |
| 1727 element preview: no serialized node degrades to descriptor chips                                                             | DELETE-DUP     | tools/styled/element-preview.stories.tsx:81 DescriptorOnly                                                                                                                                  | -        | same fixture, same three texts                                                                                                                    |
| 1739 element preview: masked password value replays as ***                                                                        | story          | tools/styled/element-preview.stories.tsx:115 MaskedField                                                                                                                                    | CMP-11   | play today only checks the img; add the masked value                                                                                              |
| 1751 element preview: hostile payload neutralized (no onerror/onclick/javascript:, no iframe)                                     | story          | tools/styled/element-preview.stories.tsx (new HostileCapture story)                                                                                                                         | CMP-12   | security; real iframe in Chromium; fixtures move to element-capture.fixtures.js                                                                   |
| 1798 element preview: hostile capture runs no script and fetches nothing                                                          | story          | tools/styled/element-preview.stories.tsx HostileCapture                                                                                                                                     | CMP-12   | same capture plus hostile CSS; needs real resource timing                                                                                         |
| 1854 element preview: inlined rr_dataURL used, remote src never fetched                                                           | story          | tools/styled/element-preview.stories.tsx HostileCapture (inlined image node)                                                                                                                | CMP-12   | needs canvas toDataURL and real resource timing                                                                                                   |
| 1878 element preview: out-of-range numeric character reference does not break rendering                                           | story          | tools/styled/element-preview.stories.tsx HostileCapture (one more hostile node)                                                                                                             | CMP-12   | one more hostile input                                                                                                                            |
| 1893 element preview: no data-rr-target marker degrades to descriptor, no frame, no busy                                          | DELETE-DUP     | tools/styled/element-preview.stories.tsx:128 FailedBuildDegradesToDescriptor                                                                                                                | -        | same capture shape, same "orphaned field"/textbox/no role=img asserts                                                                             |
| 1940 (gone by 9d4f4834f) model selector: typing right after the trigger click filters                                             | not carried    | -                                                                                                                                                                                           | -        | deleted as dead code with `ModelSelector` in 0bc80ef1b; no test at 9d4f4834f proves it, and the feature is gone                                   |
| 1950 (gone by 9d4f4834f) model selector: keystroke in the same turn as a touch tap is kept                                        | not carried    | -                                                                                                                                                                                           | -        | deleted as dead code with `ModelSelector` in 0bc80ef1b; no test at 9d4f4834f proves it, and the feature is gone                                   |
| 1973 (gone by 9d4f4834f) model selector: models that arrive after mount are listed                                                | not carried    | -                                                                                                                                                                                           | -        | deleted as dead code with `ModelSelector` in 0bc80ef1b; no test at 9d4f4834f proves it, and the feature is gone                                   |
| 1984 (gone by 9d4f4834f) model selector: right-edge narrow trigger keeps every option on screen and clickable                     | not carried    | -                                                                                                                                                                                           | -        | deleted as dead code with `ModelSelector` in 0bc80ef1b; no test at 9d4f4834f proves it, and the feature is gone                                   |
| 1910 harness model selector: Models… while reading, Retry inside after a failed read, lists models after Retry                    | DELETE-COVERED | conciv:9662 "a model list that failed to load offers Retry inside the model selector, which says Models… while Retry reads it" (terminal toolbar) and conciv:2261 (prompt)                  | -        | same states over the real engine; owner moves with the terminal plugin                                                                            |
| 1952 harness model selector: four models before the rest when default and pick are among the first                                | node (table)   | packages/ui-kit-chat/src/primitives/model-selector/model-menu.test.ts `harnessSection` (model-menu.ts:65) it.each rows                                                                      | -        | pure split by `mainAndMore`; the "N more models" line is seen at conciv:3286                                                                      |
| 1992 suggestions: a refused suggestion reports once per click through the send error path                                         | story          | styled/follow-up-suggestions.stories.tsx:37 SettledThreadShowsPills (refusing connection, visible error list)                                                                               | CMP-15   | fix #916; published kit, no product consumer; the play's last click asserts nothing today                                                         |

Totals: story 38, DELETE-DUP 13, DELETE-COVERED 5, DELETE-NOTHING 1, happy-dom (apps/conciv) 2, node 1, not carried 4 (60). Rows 1940, 1950, 1973 and 1984 tested `ModelSelector`, deleted as dead code in 0bc80ef1b; they were story rows.
The file is deleted: its tests move into story plays (38), two into the apps/conciv happy-dom shell file, one into the node unit table; 19 are dropped.

### packages/ui-kit-chat/src/primitives/composer/composer.stories.tsx (7 plays)

| test (file:line + short title)                                                                     | destination | target (package/file or owner)                                                                                               | merge-id | why (one short clause)                    |
| -------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| 62 TypeAndSend: type, Send, user and assistant text shown                                          | story       | stays                                                                                                                        | CMP-16   | headless composer send journey            |
| 74 EnterSubmits: Enter sends                                                                       | story       | merge into TypeAndSend play                                                                                                  | CMP-16   | same host, one more keystroke             |
| 109 CancelButtonRoutesThroughHandler: Stop calls onCancel once                                     | story       | stays; show a visible log instead of the `fn` spy                                                                            | CMP-17   | handler routing                           |
| 123 EscapeRoutesThroughHandler: Escape in the input calls onCancel once                            | story       | merge into CancelButtonRoutesThroughHandler                                                                                  | CMP-17   | same host                                 |
| 164 QueueMapsPendingMessages: queued messages listed, Remove drops one                             | DELETE-DUP  | styled/composer.stories.tsx:48 (queue, Remove from queue) and primitives/queue-item/queue-item.stories.tsx:66 (queued texts) | -        | play only; the story render stays as docs |
| 211 AttachmentAdapterLifecycle: accept filter, remove calls adapter, send payload shape            | story       | stays; replace `fn` spies with a visible log                                                                                 | -        | kit adapter contract on the composer      |
| 271 AttachmentSendFailureRestoresDraft: failed attachment send keeps text and marks the attachment | story       | stays; replace the `data-status` read with what the tile shows                                                               | -        | one composer state                        |

Totals: story 6, DELETE-DUP 1. Shrinks to 4 plays (plus new CMP-7 and CMP-8 stories).

### packages/ui-kit-chat/src/primitives/composer/composer-actions.stories.tsx (4 plays)

| test (file:line + short title)                                                        | destination | target (package/file or owner)                       | merge-id | why (one short clause)    |
| ------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------- | -------- | ------------------------- |
| 201 Collapsed: narrow row, menu order, run from menu, menu closes                     | story       | stays; absorbs composer.browser:705 and :802         | -        | width-fit by priority     |
| 242 CappedDefault: cap 0, everything from the menu                                    | story       | stays; absorbs composer.browser:669                  | -        | the product configuration |
| 318 PairedMenuItems: inline-only button plus paired items, unavailable swaps to Retry | story       | stays                                                | -        | only proof of the swap    |
| 361 DisabledAction: disabled inline and menu item, toggle enables                     | story       | stays; absorbs composer.browser:826 (ArrowDown skip) | CMP-6    | one component             |

Totals: story 4. Grows: plays added to AllInline, PinnedOnly, MenuOnlyAction and new cap-1 / leading-budget / inline-only / widen stories (CMP-5).

### packages/ui-kit-chat/src/styled/composer.stories.tsx (3 plays)

| test (file:line + short title)                                                                  | destination | target (package/file or owner)       | merge-id | why (one short clause)  |
| ----------------------------------------------------------------------------------------------- | ----------- | ------------------------------------ | -------- | ----------------------- |
| 39 Idle: Send shown, no Stop                                                                    | story       | stays; absorbs composer.browser:1372 | -        | one state               |
| 48 StreamingAlwaysShowsStopAndQueuesOnEnter: Stop while typing, Enter queues, Remove from queue | story       | stays; absorbs composer.browser:1389 | -        | busy-composer journey   |
| 63 SteerInterruptsWithSelectedContent: Steer sends the picked queued item                       | story       | stays                                | -        | only styled steer proof |

Totals: story 3. Stays; gains the CMP-3 refused-image story.

### packages/ui-kit-chat/src/styled/attachment-ui.stories.tsx (1 play)

| test (file:line + short title)                                                                                 | destination | target (package/file or owner)                              | merge-id | why (one short clause)                                          |
| -------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------- | -------- | --------------------------------------------------------------- |
| 75 ImageAndFileTiles: tab to Remove (focus-visible), open viewer, Escape returns focus, document inert, Remove | story       | stays; absorbs composer.browser:323, :334, :349, :358, :418 | CMP-2    | the attachment tile journey; real :focus-visible needs Chromium |

Totals: story 1. Stays and grows (transformed frame, actual size toggle, Close, no-remove tile).

### packages/ui-kit-chat/src/styled/attachment-dispatch.stories.tsx (1 play)

| test (file:line + short title)                                                  | destination | target (package/file or owner)                                                                                 | merge-id | why (one short clause)                        |
| ------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------- |
| 88 CardChipWithRemove: card by mime, tab to Remove, Play works, Remove drops it | story       | stays; drop the getBoundingClientRect overlap check (geometry assert rule) or replace with "Play is clickable" | -        | AttachmentByMime is used by chat-pane.tsx:326 |

Totals: story 1. Stays.

### packages/ui-kit-chat/src/primitives/attachment/attachment.stories.tsx (1 play)

| test (file:line + short title)                       | destination | target (package/file or owner) | merge-id | why (one short clause)                                                                                 |
| ---------------------------------------------------- | ----------- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| 78 Chips: name and PNG thumb shown, Remove drops one | story       | stays                          | -        | headless primitive state; Remove overlaps attachment-ui.stories:75 but at a different layer of the kit |

Totals: story 1. Stays.

### packages/ui-kit-chat/src/primitives/queue-item/queue-item.stories.tsx (1 play)

| test (file:line + short title)                                                     | destination | target (package/file or owner)                 | merge-id | why (one short clause)                 |
| ---------------------------------------------------------------------------------- | ----------- | ---------------------------------------------- | -------- | -------------------------------------- |
| 66 NativeQueueActions: attachment count, Steer calls onSteer and sends the content | story       | stays; replace the `fn` spy with a visible log | -        | only proof steer sends text plus image |

Totals: story 1. Stays.

### packages/ui-kit-chat/src/styled/model-selector.stories.tsx (1 play)

| test (file:line + short title)                                                                                     | destination | target (package/file or owner) | merge-id | why (one short clause)                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| 65 (gone by 9d4f4834f: story file deleted) Neutral (play at :38): open, search focused, effort group, filter, pick | not carried | -                              | -        | deleted as dead code with `ModelSelector` in 0bc80ef1b; no test at 9d4f4834f proves it, and the feature is gone |

Totals: not carried 1. The story file was deleted with `ModelSelector` in 0bc80ef1b.

### packages/ui-kit-chat/src/primitives/model-selector/model-selector.stories.tsx (1 play)

| test (file:line + short title)                                                                         | destination | target (package/file or owner) | merge-id | why (one short clause)                                                                                          |
| ------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| 16 (gone by 9d4f4834f: story file deleted) Headless: open, search focused, disabled filtered out, pick | not carried | -                              | -        | deleted as dead code with `ModelSelector` in 0bc80ef1b; no test at 9d4f4834f proves it, and the feature is gone |

Totals: not carried 1. The story file was deleted with `ModelSelector` in 0bc80ef1b.

### packages/ui-kit-chat/src/styled/follow-up-suggestions.stories.tsx (1 play)

| test (file:line + short title)                                     | destination | target (package/file or owner)                                      | merge-id | why (one short clause)              |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------- | -------- | ----------------------------------- |
| 37 SettledThreadShowsPills: pills shown on a settled thread, click | story       | stays; absorbs composer.browser:2095 and asserts what the click did | CMP-15   | the last click proves nothing today |

Totals: story 1. Stays.

### packages/ui-kit-chat/src/primitives/selection-toolbar/selection-toolbar.stories.tsx (1 play)

| test (file:line + short title)                                  | destination | target (package/file or owner) | merge-id | why (one short clause)                |
| --------------------------------------------------------------- | ----------- | ------------------------------ | -------- | ------------------------------------- |
| 54 QuoteSelection: select text, Quote selection fills the draft | story       | stays                          | -        | needs a real Selection; one component |

Totals: story 1. Stays.

Row count: composer.browser 60, story plays 22, total 82.

## Merge journeys

- CMP-1 message actions: copy writes the reply text; the older reply's hidden bar shows on hover, Tab reaches Copy, focus stays when the pointer leaves (114, 176, 237).
- CMP-2 attachment tiles: open viewer outside a transformed frame, actual size and back, Escape and Close return focus, sent tile without Remove (323, 334, 418 into attachment-ui ImageAndFileTiles).
- CMP-3 refused image chip: reason by name, tooltip on hover and on keyboard focus, input stays usable, empty message falls back to the file name (367, 396).
- CMP-4 user turn images: data source and data-URL images shown, named "image", never by data (452, 467).
- CMP-5 composer actions width fit: all inline, cap 1, pinned, leading budget, inline-only, menu-only, widen closes the menu (656, 692, 730, 743, 769, 784, 863).
- CMP-6 disabled action keyboard skip (826 into DisabledAction).
- CMP-7 attachment ops story: add, has, replace in place, replace after remove (927, 936, 946, 958).
- CMP-8 draft and items story over a story storage: persist, restore with quote, items add/update/remove/snapshot/restore, failed send keeps items, remount, items-only send, item staged during a held send, bad stored item, no handler (1045, 1097, 1214, 1281, 1325).
- CMP-9 rejected send keeps its image across a remount (1109 into the happy-dom rejected-send journey).
- CMP-10 Escape while Stopping (1408 into the happy-dom stop journey).
- CMP-11 element preview replay: value, marker, inert, store proxy, masked (1700, 1714, 1741).
- CMP-12 element preview hostile capture: no script, no fetch, no crash, inlined image (1753, 1800, 1856, 1880).
- CMP-13 primitive model selector: touch-tap race, late models (1950, 1973).
- CMP-14 styled model selector at the right edge (1984).
- CMP-15 refused suggestion (2095).
- CMP-16 headless send by click and Enter (composer.stories 62, 74).
- CMP-17 cancel routing by Stop and Escape (composer.stories 109, 123).

## Cross-file duplicates (pairs, file:line <-> file:line)

- test/composer.browser.test.tsx:245 <-> src/styled/action-bar.stories.tsx:47 CopyAndExport (Copy failed)
- test/composer.browser.test.tsx:176 (hover half) <-> src/styled/thread.stories.tsx:161 PreviousTurnActionsRevealOnHover
- test/composer.browser.test.tsx:334 (Escape half) <-> src/styled/attachment-ui.stories.tsx:75 ImageAndFileTiles (:93-95)
- test/composer.browser.test.tsx:349 <-> src/styled/attachment-ui.stories.tsx:75 ImageAndFileTiles (:100-101)
- test/composer.browser.test.tsx:358 <-> src/styled/attachment-ui.stories.tsx:75 ImageAndFileTiles (:97-98)
- test/composer.browser.test.tsx:486 <-> src/tools/styled/chip.stories.tsx:16 FieldKind
- test/composer.browser.test.tsx:508 <-> src/tools/styled/chip.stories.tsx:70 PillLongValue
- test/composer.browser.test.tsx:522 <-> packages/ui-kit-system/test/ui-kit-system.browser.test.tsx:1252
- test/composer.browser.test.tsx:669 <-> src/primitives/composer/composer-actions.stories.tsx:242 CappedDefault <-> apps/conciv/test/conciv.browser.test.tsx:1963
- test/composer.browser.test.tsx:705 <-> src/primitives/composer/composer-actions.stories.tsx:201 Collapsed
- test/composer.browser.test.tsx:802 <-> src/primitives/composer/composer-actions.stories.tsx:201 Collapsed and :318 PairedMenuItems
- test/composer.browser.test.tsx:1061 <-> apps/conciv/test/conciv.browser.test.tsx:567 and :595
- test/composer.browser.test.tsx:1139 <-> apps/conciv/test/conciv.browser.test.tsx:1221
- test/composer.browser.test.tsx:1159 <-> apps/conciv/test/conciv.browser.test.tsx:1270
- test/composer.browser.test.tsx:1372 <-> src/styled/composer.stories.tsx:39 Idle and :48
- test/composer.browser.test.tsx:1389 <-> src/styled/composer.stories.tsx:48 StreamingAlwaysShowsStopAndQueuesOnEnter (stop-click half: conciv.browser:1507, :1662)
- test/composer.browser.test.tsx:1729 <-> src/tools/styled/element-preview.stories.tsx:81 DescriptorOnly
- test/composer.browser.test.tsx:1895 <-> src/tools/styled/element-preview.stories.tsx:128 FailedBuildDegradesToDescriptor
- test/composer.browser.test.tsx:1940 <-> src/primitives/model-selector/model-selector.stories.tsx:16 Headless and src/styled/model-selector.stories.tsx:65 Neutral
- test/composer.browser.test.tsx:2013 <-> apps/conciv/test/conciv.browser.test.tsx:9662 (and :2261)
- test/composer.browser.test.tsx:2055 (the "N more models" line) <-> apps/conciv/test/conciv.browser.test.tsx:3286
- src/primitives/composer/composer.stories.tsx:164 QueueMapsPendingMessages <-> src/styled/composer.stories.tsx:48 and src/primitives/queue-item/queue-item.stories.tsx:66
- src/primitives/attachment/attachment.stories.tsx:78 Chips (Remove) overlaps src/styled/attachment-ui.stories.tsx:75 (kept: headless vs styled)

Browser tests a story play already duplicates (decision 5): 13 here (245, 349, 358, 486, 508, 669, 705, 802, 1372, 1389, 1729, 1895, 1940), more than the plan's estimate of about 8 for this file alone.

## Plugin-owned tests (tests that a plugin should own, if any)

- composer.browser:2013 is covered by conciv:9662, a terminal toolbar test: when the terminal moves out, that owner is happy-dom in `@conciv/plugin-terminal`.
- The element preview tests (CMP-11, CMP-12) guard what the page plugin cards render (cards.tsx `ActCard`, `EditLiveCard`), but ElementPreview is a kit component: they stay as ui-kit-chat story plays. The page plugin needs no copy.
- No test in this file moves to a plugin directly.

## Cannot move to happy-dom (looks like it could, but needs X) and suspected happy-dom blockers

- Composer actions width fit (656, 692, 730, 743, 769, 784, 826, 863 and the four plays): measures real widths through ResizeObserver; happy-dom has no layout, so every width is 0.
- Element preview (1700-1895 and its plays): rebuilds into a sandboxed iframe through srcdoc and reads its document; happy-dom does not run sandboxed iframes like a browser, and 1800/1856 need real resource timing (`performance.getEntriesByType('resource')` per frame) and canvas `toDataURL`.
- Action bar reveal (176, 237): needs a real :hover reveal and real Tab order and focus.
- Refused image chip (367): its tooltip opens on keyboard focus (Ark/zag focus-visible gating) and is positioned. Image viewer (323): portals out of a CSS-transformed ancestor.
- attachment-ui ImageAndFileTiles and attachment-dispatch CardChipWithRemove: assert `:focus-visible`.
- Chip clipping (508, 522): needs real text overflow (scrollWidth vs clientWidth).
- Model selector right edge (1984): positioning, `toBeInViewport`. Touch-tap race (1950): pointer events plus focus timing in Ark's popover; happy-dom's focus model would not reproduce the race.
- Clipboard (114, 245): needs `navigator.clipboard` refusal semantics; 114 injects writeText so it could run anywhere, but it merges into a story.
- selection-toolbar QuoteSelection: needs a real Selection and range.
- Fine in happy-dom: 1109 (File and FileReader, no layout) and 1408 (keyboard Escape and run lifecycle), both sent to happy-dom (apps/conciv). CMP-7 and CMP-8 have no layout either and could run in happy-dom, but they are kit contracts with no shell, so they go to stories per the group ruling.
- Rule breaks to fix while moving: `fn` spies in composer.stories:107/121/206/207/263 and queue-item.stories:64 (storybook spies: rule 2 bans them; each becomes a visible log the play reads, Decision K5); DOM attribute reads `data-copied` (114), `data-status` (composer.stories:282), `aria-describedby` (522), `defaultPrevented` (1408), iframe DOM queries (1700-1895); geometry (attachment-dispatch.stories:102-110); fake timers in 367 for the tooltip close delay; synthetic PointerEvents and a direct `search.value` write in 1950.

---

# Part: thread

# Part 2: ui-kit-chat thread test + thread-area story plays (merge-id prefix THR)

Worktree /Users/omrikatz/Public/web/aidx-wt-test-split (origin/main 86d94e743). Every file below read in full there. The
audit (test-audit-ui-kit-chat-thread.md) was written against an older 1,838-line file; line numbers here are the
worktree's. Three tests changed or appeared since that audit: 1249 (now "offers no session action"), 1258 ("Always
allow"), 1480 ("turn action rows"); 1026 no longer checks a copy refusal.

Facts checked in the worktree that drive the rulings:

- `Activity` (src/styled/activity.tsx) has no product consumer; it is exported from src/index.tsx:59, so it is public
  kit API and its tests are kept (group ruling), not deleted.
- `TraceActionRow` has no product consumer; exported from src/tools.tsx:64: public, kept.
- `NowLine` is rendered by apps/conciv/src/pane/chat-pane.tsx:353 without `onStop`; `onStop` is a public prop: kept.
- `groupEntries` is passed by no product surface (only src/styled/thread.tsx:584 forwards it): public prop, kept.
- `TracePermissionBlock` is rendered by apps/conciv/src/pane/pending-approvals.tsx:30.
- The page session card in the product is `PAGE_SESSION` in apps/conciv/src/pane/chat-pane.tsx:88, rendered by the
  page plugin (`Contribution plugin="page"`, card in packages/plugins/page/src/cards.tsx).
- `createPageSessionGrouper`, `pageSessionCallParts`, `pageSessionThinkingParts` (src/store/page-session.ts:166-195)
  and `defaultGrouper` are pure: the grouping claims of 474/547/569/590 are table rows, not renders.
- `Suggestion` is on decision 8's delete list (API kept alive only by tests).

Stories already run in real Chromium (Storybook + addon-vitest), and stories in this package already mount a full
`Thread` over `createChat` + `storyConnection` (styled/thread.stories.tsx). So a Thread state or a simple click/keyboard
interaction on a seeded or story-streamed thread goes to story. Only the virtual list behaviour, which needs real
sizes and scrolling over many turns, stays a browser test (browser mode, in the package's one remaining browser file).

## packages/ui-kit-chat/test/thread.browser.test.tsx (56 tests)

| test (file:line + short title)                                                                      | destination    | target (package/file or owner)                                                                                                                                                                          | merge-id | why (one short clause)                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 70 bottom pinned log scrollers > keeps the newest activity turn showing as the timeline grows       | story          | src/styled/activity.stories.tsx, new story (growing timeline)                                                                                                                                           | THR-10   | public `Activity` state; toBeInViewport needs real layout, which Storybook Chromium has                                                            |
| 117 empty group suppression > no group wrapper for a run of unrenderable data parts                 | story          | src/styled/thread.stories.tsx, seeded transcript story                                                                                                                                                  | THR-1    | one more assistant turn in the static transcript; assert no trace button                                                                           |
| 165 latest chip overlay > Latest chip as an overlay outside the scroll content                      | DELETE-COVERED | apps/conciv/test/conciv.browser.test.tsx:3049 (Latest glides to the newest message), owner browser mode                                                                                                 | -        | rest is DOM reads (`.inert`, `nextElementSibling`, `data-at-bottom`)                                                                               |
| 241 message if has text > grab-only turn with only model-only text draws no bubble                  | story          | src/styled/thread.stories.tsx, seeded transcript story                                                                                                                                                  | THR-1    | real Thread instead of a hand-built MessageProvider; assert no "You:" article for that turn                                                        |
| 247 message if has text > a turn with visible text still draws its bubble                           | story          | same                                                                                                                                                                                                    | THR-1    | positive twin of 241; 1942's "You:" articles already show it                                                                                       |
| 302 nested group rendering > registered child entry inside its parent entry slot                    | story          | src/styled/thread.stories.tsx, new story (nested group entries)                                                                                                                                         | THR-2    | only proof of nested `groupEntries` (public prop)                                                                                                  |
| 316 nested group rendering > flattens an unregistered child group key                               | story          | same                                                                                                                                                                                                    | THR-2    | same fixture, second grouping                                                                                                                      |
| 326 nested group rendering > flattens an unregistered top-level group key                           | story          | same                                                                                                                                                                                                    | THR-2    | same fixture, third grouping                                                                                                                       |
| 355 now line > one quiet mono line led by a visible braille spinner glyph                           | story          | src/styled/now-line.stories.tsx:20 Running (add glyph assert)                                                                                                                                           | THR-8    | Running already asserts the title; glyph is one more visible assert                                                                                |
| 362 now line > freezes the spinner glyph under prefers-reduced-motion                               | story          | src/styled/now-line.stories.tsx, new reduced-motion story; reduced motion comes from the runner, never a `matchMedia` stub (Decision K6)                                                                | THR-8    | only reduced-motion proof; use real media emulation, drop the hand `window.matchMedia` stub (it also leaks on failure)                             |
| 370 now line > mono text Stop affordance                                                            | story          | src/styled/now-line.stories.tsx:20 Running (click Stop, show the outcome)                                                                                                                               | THR-8    | Running already finds "Stop generating"; add the click and a visible result                                                                        |
| 438 page session injection > one injected page-session card with the reply, no chain                | DELETE-COVERED | apps/conciv/test/conciv.browser.test.tsx:4140 (one aggregated session card with the reply), owner page plugin                                                                                           | -        | real card over a real turn; this uses a stub card                                                                                                  |
| 459 page session injection > trailing page-session live while running, settled on stop              | story          | src/styled/thread.stories.tsx, new story (page session, ask + halt buttons, stub card)                                                                                                                  | -        | no other test stops a run inside a page session; storyConnection `runsUntilStopped` works in a story                                               |
| 474 page session injection > flat chain when no page-session config is passed                       | node (table)   | packages/ui-kit-chat/src/store/page-session.test.ts grouping table                                                                                                                                      | THR-U1   | row: `defaultGrouper` puts a `page_fill` act on the chain path                                                                                     |
| 528 page session injection > live activity session settles once a trailing reply follows            | story          | src/styled/activity.stories.tsx, new story (live, pageSession, trailing text)                                                                                                                           | THR-10   | the "settled" flag comes from Activity's render (`lastRenderableIndex`), not a pure function                                                       |
| 547 page session injection > settled page-session between prose without a steps group               | node (table)   | packages/ui-kit-chat/src/store/page-session.test.ts grouping table                                                                                                                                      | THR-U1   | row: `createPageSessionGrouper` puts both acts on the page-session path, none on the chain; `pageSessionCallParts` gives 2                         |
| 569 page session injection > folds a code-mode run into the session card                            | node (table)   | packages/ui-kit-chat/src/store/page-session.test.ts                                                                                                                                                     | THR-U1   | row: parent `execute_typescript` + child `page_fill` (parentToolCallId) all on the page-session path                                               |
| 590 page session injection > hands the folded thinking parts to the renderer                        | node (table)   | packages/ui-kit-chat/src/store/page-session.test.ts                                                                                                                                                     | THR-U1   | row: `pageSessionThinkingParts` returns the 1 folded thinking part                                                                                 |
| 633 standalone card replaced in place > reads the result of the call it now shows                   | story          | src/styled/thread.stories.tsx, new story (replace button swaps the transcript)                                                                                                                          | -        | row-reuse regression (68087cdb0); one click on one component                                                                                       |
| 700 standalone tool outside chain > standalone card outside the trace, trace stays open             | DELETE-DUP     | src/primitives/message/message.stories.tsx:176 PartsGroupedWithGrouping (standalone card outside "group-chain holds 1") + src/styled/thread.stories.tsx:94 Neutral (trace open after the run, play :79) | -        | both halves already proven by plays                                                                                                                |
| 718 status visual > each status its own accessible name in dot form                                 | DELETE-DUP     | src/tools/primitives/status-visual.stories.tsx:37 DotForm                                                                                                                                               | -        | same names, superset of statuses                                                                                                                   |
| 727 status visual > default "Error" label and the message                                           | DELETE-DUP     | src/tools/styled/error-block.stories.tsx:14 Default                                                                                                                                                     | -        | identical render and asserts                                                                                                                       |
| 760 thinking narration > readable trace for a segment that only reasoned                            | story          | src/styled/thread.stories.tsx, seeded transcript story                                                                                                                                                  | THR-1    | one thinking-only turn in the transcript; open trace shows "reasoning"                                                                             |
| 781 thinking narration > running tool narrated on the collapsed trace line                          | DELETE-COVERED | apps/conciv/test/conciv.browser.test.tsx:4222 (folded trace line says Reading the route)                                                                                                                | -        | real run with a held result proves the same narration                                                                                              |
| 821 thread composition > welcome only while empty, keeps the composed regions                       | DELETE-DUP     | src/styled/thread.stories.tsx:94 Neutral (welcome then send, play :72-74) + :185 Slots (composer region)                                                                                                | -        | play covers welcome, send and the composer slot                                                                                                    |
| 879 thread session log > settled non-active turn folds to its record line, toggles open             | story          | src/styled/thread.stories.tsx, seeded transcript story                                                                                                                                                  | THR-1    | only proof a non-active settled turn starts folded; assert Show/Hide trace names, not `data-state`                                                 |
| 935 thread session log > each trace segment of one turn its own summary line                        | story          | same                                                                                                                                                                                                    | THR-1    | two segments, "1 read" / "1 bash"                                                                                                                  |
| 1026 thread session log > outside agent calls as one open list, no action row under text-less calls | story          | src/styled/thread.stories.tsx, new story (action rows and outside calls)                                                                                                                                | THR-3    | "from claude" tags, no trace fold, Refresh disabled on log-out; journey with 1480                                                                  |
| 1056 thread session log > text, trace, then text in stream order                                    | story          | src/styled/thread.stories.tsx, seeded transcript story                                                                                                                                                  | THR-1    | rewrite the order check without `[data-conciv-msg]` DOM walking (read the article's children by role)                                              |
| 1087 trace output block > names normal output and error output                                      | DELETE-DUP     | src/styled/trace/output-block.stories.tsx:34 Normal + :42 ErrorTone                                                                                                                                     | -        | same group names                                                                                                                                   |
| 1102 trace output block > copies the block text and announces it                                    | story          | src/styled/trace/output-block.stories.tsx:68 ChromeRowActions                                                                                                                                           | THR-5    | story passes a `writeText` that records; assert status "Copied the output"                                                                         |
| 1120 trace output block > announces a clipboard refusal                                             | story          | same, sibling story with a refusing `writeText`                                                                                                                                                         | THR-5    | "Could not copy the output"                                                                                                                        |
| 1133 trace output block > runs the open action                                                      | story          | same ChromeRowActions (click Open, show the result)                                                                                                                                                     | THR-5    | ChromeRowActions already renders Open; add the click                                                                                               |
| 1152 trace output block > no Open without an open action                                            | story          | output-block.stories.tsx:34 Normal (assert no Open button)                                                                                                                                              | THR-5    | replaces the `querySelectorAll('button')` count with a role query                                                                                  |
| 1183 trace permission block > approves through Approve                                              | story          | src/styled/trace/permission-block.stories.tsx, new Approved story                                                                                                                                       | THR-6    | Approved + status "Approved the request"; reply shown on screen by the story's ctx                                                                 |
| 1206 trace permission block > denies through Deny                                                   | DELETE-DUP     | src/styled/trace/permission-block.stories.tsx:76 Answered                                                                                                                                               | -        | play clicks Deny, sees Denied, buttons gone, status "Denied the request"; reply 'reject' is proven by apps/conciv/test/conciv.browser.test.tsx:186 |
| 1218 trace permission block > approves only on modifier-Enter, never bare Enter                     | story          | permission-block.stories.tsx, keyboard story                                                                                                                                                            | THR-6    | needs real focus (Tab to the group); Storybook Chromium has it                                                                                     |
| 1237 trace permission block > Escape on the focused block denies                                    | story          | same keyboard story                                                                                                                                                                                     | THR-6    | same focused block                                                                                                                                 |
| 1249 trace permission block > no session action: only Approve and Deny                              | story          | permission-block.stories.tsx:41 Asking (assert no "Always allow")                                                                                                                                       | THR-6    | replaces the button count with a role query                                                                                                        |
| 1258 trace permission block > Always allow only for a savable ask, replies always                   | story          | permission-block.stories.tsx, new Savable story                                                                                                                                                         | THR-6    | only positive "always" proof on the block                                                                                                          |
| 1269 (gone by 9d4f4834f) trace permission block > expiry countdown only with a deadline             | not carried    | -                                                                                                                                                                                                       | -        | the expiry chip (`expiresAt`) was deleted as dead code in 0bc80ef1b; no test at 9d4f4834f proves it, and the feature is gone                       |
| 1321 trace > one row per item with the mark of its outcome                                          | story          | src/styled/trace/trace.stories.tsx:63 AllRowKinds (add succeeded + completed with warnings)                                                                                                             | THR-7    | AllRowKinds renders pass/warn/fail but asserts only "failed"                                                                                       |
| 1332 trace > at most one live step runs, earlier live steps pending                                 | DELETE-DUP     | src/styled/trace/trace.stories.tsx:78 OneRingInvariant                                                                                                                                                  | -        | play asserts exactly 1 running and 2 pending                                                                                                       |
| 1342 trace > collapses to a record line and restores rows on toggle                                 | story          | trace.stories.tsx:63 AllRowKinds (Hide trace, Show trace)                                                                                                                                               | THR-7    | kit toggle; conciv:4222 only hides                                                                                                                 |
| 1359 trace > starts collapsed when opened closed                                                    | DELETE-DUP     | src/styled/trace/trace.stories.tsx:104 FoldedByNextPrompt                                                                                                                                               | -        | same `folded` render, Show trace + compact line                                                                                                    |
| 1366 trace > action row runs its action, shows hint and explainer                                   | story          | trace.stories.tsx:63 AllRowKinds (its action row: click, see the result)                                                                                                                                | THR-7    | public `TraceActionRow`; AllRowKinds already renders it                                                                                            |
| 1461 turn action rows > action row only on turns with text, keyboard reachable on the latest        | story          | src/styled/thread.stories.tsx, new story (action rows and outside calls)                                                                                                                                | THR-3    | needs real focus and Tab order; Storybook Chromium has it                                                                                          |
| 1604 virtual scroll > card-heavy thread never trips a ResizeObserver loop                           | browser mode   | packages/ui-kit-chat/src/ui-kit-chat.browser.test.tsx single browser file (virtual list journey)                                                                                                        | THR-9    | real ResizeObserver + virtual list; move the window `error` listener into a fixture (today it is module-level, never removed)                      |
| 1731 virtual thread > virtualizes above the threshold, pinned to latest                             | browser mode   | packages/ui-kit-chat/src/ui-kit-chat.browser.test.tsx                                                                                                                                                   | THR-9    | virtual list needs real sizes; drop the `data-at-bottom` read                                                                                      |
| 1739 virtual thread > windows nothing below the threshold                                           | browser mode   | packages/ui-kit-chat/src/ui-kit-chat.browser.test.tsx                                                                                                                                                   | THR-9    | start below, grow above in one test                                                                                                                |
| 1746 virtual thread > crossing the threshold while following keeps the bottom pinned                | browser mode   | packages/ui-kit-chat/src/ui-kit-chat.browser.test.tsx                                                                                                                                                   | THR-9    | same journey                                                                                                                                       |
| 1757 virtual thread > nested scroller's downward wheel leaves the reader in place                   | browser mode   | packages/ui-kit-chat/src/ui-kit-chat.browser.test.tsx                                                                                                                                                   | THR-9    | real wheel routing to a nested scroller (fix 329d617ad)                                                                                            |
| 1775 virtual thread > history prepend keeps the reading position                                    | DELETE-COVERED | apps/conciv/test/conciv.browser.test.tsx:2971 (older page loads, messages in view stay)                                                                                                                 | -        | real paging; this one writes `scrollTop` and dispatches a synthetic WheelEvent                                                                     |
| 1851 same-count turn replacement > repacks when every turn is replaced, same count                  | browser mode   | packages/ui-kit-chat/src/ui-kit-chat.browser.test.tsx browser file                                                                                                                                      | THR-9    | virtualizer remeasure (perf fix 9ea8792e7); toBeInViewport needs real layout                                                                       |
| 1855 same-count turn replacement > repacks when the same turns come back shorter                    | browser mode   | packages/ui-kit-chat/src/ui-kit-chat.browser.test.tsx                                                                                                                                                   | THR-9    | second id prefix of the same helper                                                                                                                |
| 1923 message articles > names each message by author and prompt                                     | story          | src/styled/thread.stories.tsx, seeded transcript story                                                                                                                                                  | THR-1    | accessible names (fix f5f2ac4b2); the static transcript anchor, a11y checked by Storybook                                                          |

Totals: story 32, browser mode 7, node 4, DELETE-DUP 8, DELETE-COVERED 4, not carried 1 (1269: the expiry chip was deleted as dead code in 0bc80ef1b). (56)

The file is deleted. Its 7 virtual list tests become one journey (THR-9) in ui-kit-chat's single browser file (merged
with what survives of composer/cards/markdown); 33 tests become story plays (mostly new stories in
styled/thread.stories.tsx, plus activity, now-line, output-block, permission-block and trace stories); 4 become rows in
the grouping table of test/ui-kit-chat.test.ts. The 8 DELETE-DUP rows are this file's share of decision 5.

Merge journeys:

- THR-1 static transcript story (styled/thread.stories.tsx): article names (1942), model-only/grab-only turn draws no
  bubble (241, 247), data parts make no group (117), thinking-only trace (760), older settled turn folded and toggled
  (879), one summary per segment (935), stream order (1056).
- THR-2 nested group entries story: 302, 316, 326.
- THR-3 action rows and outside calls story: 1026, 1480.
- THR-5 output block stories: 1102, 1120, 1133, 1152.
- THR-6 permission block stories: 1183, 1218, 1237, 1249, 1258, 1269.
- THR-7 trace AllRowKinds play: 1340, 1361, 1385.
- THR-8 now line stories: 355, 362, 370.
- THR-9 virtual list browser journey: 1623, 1750, 1758, 1765, 1776, 1870, 1874.
- THR-10 activity stories: 70, 528.
- THR-U1 page-session grouping table rows: 474, 547, 569, 590.

## packages/ui-kit-chat/src/styled/thread.stories.tsx (3 plays)

| test (file:line + short title)                                                             | destination | target (package/file or owner) | merge-id | why (one short clause)                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ----------- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 94 Neutral (play 53-91): welcome, send, streamed trace open, fold keeps the reply in place | story       | stays                          | -        | absorbs thread:700 and thread:821; play reads `data-state` and `getBoundingClientRect` (lines 79, 81-89): rewrite to Show/Hide trace names and drop the geometry assert (decision 6) |
| 162 PreviousTurnActionsRevealOnHover                                                       | story       | stays                          | -        | hover reveal is CSS opacity; uses `closest('[data-role="assistant"]')`: scope by article role instead                                                                                |
| 185 Slots                                                                                  | story       | stays                          | -        | turnPrefix, now line and composer busy slots render                                                                                                                                  |

Totals: story 3. Stays and grows: hosts the new THR-1, THR-2, THR-3 stories and the 459 and 633 stories.

## packages/ui-kit-chat/src/primitives/thread/thread.stories.tsx (3 plays)

| test                       | destination | target | merge-id | why                                                                                                                                                          |
| -------------------------- | ----------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 64 StreamsAFullTurn        | story       | stays  | -        | primitive Thread streams reasoning, tool, text                                                                                                               |
| 93 EmptyState              | story       | stays  | -        | primitive `Thread.Empty` state                                                                                                                               |
| 118 SuggestionsSendOnClick | story       | stays  | -        | `Thread.Suggestions` is published kit API, kept by the group ruling (this overrides plan decision 8, which lists Suggestion for deletion; flag for a ruling) |

Totals: story 3. Stays.

## packages/ui-kit-chat/src/primitives/message/message.stories.tsx (4 plays)

Note: a plain `grep -c 'play:'` reports 5 because it also matches `display: 'standalone'` at line 142; the file has 4
stories with play (60, 77, 114, 176).

| test                         | destination | target | merge-id | why                                                    |
| ---------------------------- | ----------- | ------ | -------- | ------------------------------------------------------ |
| 60 Attachments               | story       | stays  | -        | attachment chips by name                               |
| 77 AttachmentByIndexShowsOne | story       | stays  | -        | only the indexed attachment renders                    |
| 114 PartsGrouped             | story       | stays  | -        | default grouping: chain group, no page session         |
| 176 PartsGroupedWithGrouping | story       | stays  | -        | absorbs thread:700 (standalone card outside the chain) |

Totals: story 4. Stays.

## packages/ui-kit-chat/src/primitives/message-part/message-part.stories.tsx (3 plays)

| test                       | destination | target | merge-id | why                                  |
| -------------------------- | ----------- | ------ | -------- | ------------------------------------ |
| 29 ImagePart               | story       | stays  | -        | data image renders with its alt      |
| 74 InProgressWhileToolRuns | story       | stays  | -        | InProgress slot while a call streams |
| 126 PartAccessors          | story       | stays  | -        | file/data/source accessor hooks      |

Totals: story 3. Stays.

## packages/ui-kit-chat/src/primitives/action-bar/action-bar.stories.tsx (3 plays)

| test                               | destination | target | merge-id | why                                                                               |
| ---------------------------------- | ----------- | ------ | -------- | --------------------------------------------------------------------------------- |
| 74 LiveActionsOnly                 | story       | stays  | -        | gated actions absent without handlers                                             |
| 88 GatedActionsLightUpWithHandlers | story       | stays  | -        | handlers light them up                                                            |
| 146 AutohideFloatOnHover           | story       | stays  | -        | hover reveal needs real CSS; drop the `data-floating` attribute assert (line 156) |

Totals: story 3. Stays.

## packages/ui-kit-chat/src/styled/action-bar.stories.tsx (1 play)

| test             | destination | target | merge-id | why                                                                                                                                                                                                     |
| ---------------- | ----------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 47 CopyAndExport | story       | stays  | -        | copy refusal, tooltip, overflow menu; relies on Chromium refusing `clipboard.writeText` (environment) and reads `data-copied`/`data-copy-failed` (lines 56, 59): assert the button name and status only |

Totals: story 1. Stays.

## packages/ui-kit-chat/src/primitives/action-bar-more/action-bar-more.stories.tsx (1 play)

| test            | destination | target | merge-id | why                      |
| --------------- | ----------- | ------ | -------- | ------------------------ |
| 10 OverflowMenu | story       | stays  | -        | menu opens, item selects |

Totals: story 1. Stays.

## packages/ui-kit-chat/src/styled/branch-picker.stories.tsx (2 plays)

| test                      | destination | target | merge-id | why                              |
| ------------------------- | ----------- | ------ | -------- | -------------------------------- |
| 30 TwoBranches            | story       | stays  | -        | Previous/Next enable and disable |
| 45 HiddenWhenSingleBranch | story       | stays  | -        | no provider, no buttons          |

Totals: story 2. Stays.

## packages/ui-kit-chat/src/primitives/branch-picker/branch-picker.stories.tsx (2 plays)

| test                      | destination    | target | merge-id | why                                                                                                                                      |
| ------------------------- | -------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 9 InertSingleBranch       | story          | stays  | -        | "1 / 1", both buttons disabled                                                                                                           |
| 27 HiddenWhenSingleBranch | DELETE-NOTHING | -      | -        | play asserts only the "before"/"after" siblings, never that the count is gone; the render may stay as a visual, or the play gains "no 1" |

Totals: story 1, DELETE-NOTHING 1.

## packages/ui-kit-chat/src/primitives/thread-list/thread-list.stories.tsx (1 play)

| test               | destination | target | merge-id | why                                           |
| ------------------ | ----------- | ------ | -------- | --------------------------------------------- |
| 28 SelectAndCreate | story       | stays  | -        | select, create, Delete absent without handler |

Totals: story 1. Stays.

## packages/ui-kit-chat/src/styled/now-line.stories.tsx (1 play)

| test       | destination | target | merge-id | why                                                                                |
| ---------- | ----------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| 20 Running | story       | stays  | THR-8    | absorbs thread:355 and thread:370; a reduced-motion sibling story takes thread:362 |

Totals: story 1. Stays, gains one story.

## packages/ui-kit-chat/src/styled/group.stories.tsx (3 plays)

| test                   | destination | target | merge-id | why                         |
| ---------------------- | ----------- | ------ | -------- | --------------------------- |
| 15 CollapsedThenExpand | story       | stays  | -        | plural count label, expand  |
| 39 SingularLabelOpen   | story       | stays  | -        | singular label, defaultOpen |
| 58 Streaming           | story       | stays  | -        | streaming autoOpen          |

Totals: story 3. Stays.

## packages/ui-kit-chat/src/styled/activity.stories.tsx (4 plays)

| test               | destination | target | merge-id | why                                  |
| ------------------ | ----------- | ------ | -------- | ------------------------------------ |
| 45 SettledTurn     | story       | stays  | -        | steps group, reasoning row           |
| 75 LiveTurn        | story       | stays  | -        | live call shows                      |
| 114 NestedSubCalls | story       | stays  | -        | code-mode parent nests its sub-calls |
| 135 ErrorStep      | story       | stays  | -        | error step row                       |

Totals: story 4. Stays, gains the THR-10 stories (thread:70, thread:528).

## packages/ui-kit-chat/src/styled/reasoning.stories.tsx (4 plays)

| test                          | destination    | target | merge-id | why                                                                                                                |
| ----------------------------- | -------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| 17 Streaming                  | story          | stays  | -        | "Thinking…" label with text                                                                                        |
| 31 SettledCollapsedThenExpand | story          | stays  | -        | collapsed, expands on click                                                                                        |
| 46 DefaultOpen                | story          | stays  | -        | open by default                                                                                                    |
| 60 CappedVsGrowSideBySide     | DELETE-NOTHING | -      | -        | play finds "Line 19" twice, which holds whether or not the cap clips it; the side-by-side render may stay for eyes |

Totals: story 3, DELETE-NOTHING 1.

## packages/ui-kit-chat/src/styled/trace/trace.stories.tsx (5 plays)

| test                     | destination | target | merge-id | why                                                                                                         |
| ------------------------ | ----------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| 63 AllRowKinds           | story       | stays  | THR-7    | absorbs thread:1340, 1361, 1385                                                                             |
| 78 OneRingInvariant      | story       | stays  | -        | absorbs thread:1351 (DELETE-DUP)                                                                            |
| 94 LiveAccentMidProgress | story       | stays  | -        | one live step among settled/queued                                                                          |
| 104 FoldedByNextPrompt   | story       | stays  | -        | absorbs thread:1378 (DELETE-DUP)                                                                            |
| 122 LongLabelNoOverlap   | story       | stays  | -        | play proves the long row renders, not "no overlap" (that is visual only; no geometry assert per decision 6) |

Totals: story 5. Stays.

## packages/ui-kit-chat/src/styled/trace/output-block.stories.tsx (4 plays)

| test                | destination | target | merge-id | why                                                         |
| ------------------- | ----------- | ------ | -------- | ----------------------------------------------------------- |
| 34 Normal           | story       | stays  | THR-5    | absorbs thread:1087 (Output name) and thread:1152 (no Open) |
| 42 ErrorTone        | story       | stays  | -        | absorbs thread:1087 (Error output name)                     |
| 55 DeniedSingleLine | story       | stays  | -        | error tone around a CodeBlock child                         |
| 68 ChromeRowActions | story       | stays  | THR-5    | absorbs thread:1102, 1120, 1133                             |

Totals: story 4. Stays, gains a refusal sibling story.

## packages/ui-kit-chat/src/styled/trace/permission-block.stories.tsx (3 plays)

| test                              | destination | target | merge-id | why                                                                                                                          |
| --------------------------------- | ----------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 41 Asking                         | story       | stays  | THR-6    | absorbs thread:1249 and the no-timer half of 1269                                                                            |
| 59 (gone by 9d4f4834f) WithExpiry | not carried | -      | -        | the expiry chip (`expiresAt`) was deleted as dead code in 0bc80ef1b; no test at 9d4f4834f proves it, and the feature is gone |
| 59 Answered                       | story       | stays  | -        | absorbs thread:1206 (DELETE-DUP)                                                                                             |

Totals: story 2, not carried 1 (WithExpiry, deleted with the expiry chip in 0bc80ef1b). Stays, gains Approved, Savable and keyboard stories.

## packages/ui-kit-chat/src/store/chat-context.stories.tsx (1 play)

| test                             | destination | target | merge-id | why                                           |
| -------------------------------- | ----------- | ------ | -------- | --------------------------------------------- |
| 49 StreamsTextThroughRealUseChat | story       | stays  | -        | `useThread`/`useComposer` over a streamed run |

Totals: story 1. Stays.

## packages/ui-kit-chat/src/primitives/assistant-modal/assistant-modal.stories.tsx (2 plays)

| test                 | destination | target | merge-id | why                             |
| -------------------- | ----------- | ------ | -------- | ------------------------------- |
| 13 TriggerOpensPanel | story       | stays  | -        | trigger opens content           |
| 53 OpensOnRunStart   | story       | stays  | -        | `openOnRunStart` opens on a run |

Totals: story 2. Stays.

## packages/ui-kit-chat/src/primitives/error/error.stories.tsx (1 play)

| test             | destination | target | merge-id | why                     |
| ---------------- | ----------- | ------ | -------- | ----------------------- |
| 28 ShowsRunError | story       | stays  | -        | run error message shows |

Totals: story 1. Stays.

Story plays total: 51 (styled/thread 3, primitives/thread 3, message 4, message-part 3, action-bar 3, styled
action-bar 1, action-bar-more 1, styled branch-picker 2, primitives branch-picker 2, thread-list 1, now-line 1, group 3,
activity 4, reasoning 4, trace 5, output-block 4, permission-block 3, chat-context 1, assistant-modal 2, error 1).
story 49, DELETE-NOTHING 2.

## Cross-file duplicates (pairs, file:line <-> file:line)

Browser test <-> story play (decision 5; these 8 become DELETE-DUP):

- test/thread.browser.test.tsx:700 <-> src/primitives/message/message.stories.tsx:176 PartsGroupedWithGrouping and src/styled/thread.stories.tsx:94 Neutral (play :79)
- test/thread.browser.test.tsx:718 <-> src/tools/primitives/status-visual.stories.tsx:37 DotForm
- test/thread.browser.test.tsx:727 <-> src/tools/styled/error-block.stories.tsx:14 Default
- test/thread.browser.test.tsx:821 <-> src/styled/thread.stories.tsx:94 Neutral (play :72-74) and :185 Slots
- test/thread.browser.test.tsx:1087 <-> src/styled/trace/output-block.stories.tsx:34 Normal and :42 ErrorTone
- test/thread.browser.test.tsx:1206 <-> src/styled/trace/permission-block.stories.tsx:76 Answered
- test/thread.browser.test.tsx:1351 <-> src/styled/trace/trace.stories.tsx:78 OneRingInvariant
- test/thread.browser.test.tsx:1378 <-> src/styled/trace/trace.stories.tsx:104 FoldedByNextPrompt

Partial overlaps (the test becomes a merge into the story, not a delete):

- thread:1340 <-> trace.stories.tsx:63 AllRowKinds (story asserts only "failed")
- thread:1133 <-> output-block.stories.tsx:68 ChromeRowActions (story renders Open, never clicks it)
- thread:1269 <-> permission-block.stories.tsx:59 WithExpiry (story proves presence, not absence)
- thread:355/370 <-> now-line.stories.tsx:20 Running (story shows title and Stop, no glyph, no click)

Browser test <-> other test file (DELETE-COVERED):

- thread:165 <-> apps/conciv/test/conciv.browser.test.tsx:3049
- thread:438 <-> apps/conciv/test/conciv.browser.test.tsx:4140
- thread:781 <-> apps/conciv/test/conciv.browser.test.tsx:4222
- thread:1794 <-> apps/conciv/test/conciv.browser.test.tsx:2971
- thread:1206 reply value 'reject' <-> apps/conciv/test/conciv.browser.test.tsx:186

Story <-> other file (both stay, noted only):

- src/styled/action-bar.stories.tsx:47 CopyAndExport "Copy failed" <-> test/composer.browser.test.tsx:251 (same real clipboard refusal, different component)
- src/styled/thread.stories.tsx:94 Neutral <-> src/primitives/thread/thread.stories.tsx:64 StreamsAFullTurn (styled vs primitive Thread, both stream a reasoning + tool + text turn; keep both, they cover different layers of the kit)

## Plugin-owned tests (tests that a plugin should own, if any)

None in these files moves to a plugin directly. Two thread tests are deleted because a page-plugin test already owns
the behaviour; when conciv.browser is rewritten, those owners should land in the page plugin's happy-dom file
(happy-dom in `@conciv/plugin-page`):

- thread:438 -> owner apps/conciv/test/conciv.browser.test.tsx:4140 (aggregated page session card with the reply).
- thread:781 -> owner apps/conciv/test/conciv.browser.test.tsx:4222 (folded trace line names the running page read).
  The kit keeps the generic page-session plumbing with a stub card: 459 (story) and THR-U1 (node).

## Cannot move to happy-dom (looks like it could, but needs X) and suspected happy-dom blockers

- THR-9 (thread:1623, 1750, 1758, 1765, 1776, 1870, 1874): @tanstack/virtual needs real element sizes and scroll
  positions; 1623 needs a real ResizeObserver to fire; 1776 needs wheel routing to a nested scroller; 1870/1874 assert
  toBeInViewport after a remeasure. happy-dom gives zero sizes and a no-op ResizeObserver.
- thread:70 and the THR-10 Activity story: toBeInViewport on a bottom-pinned timeline needs real layout.
- thread:1480 (THR-3): Tab order and `toHaveFocus` across the action rows and the trace trigger; hover keeping focus.
  Real focus, so Storybook Chromium, not happy-dom.
- thread:1218/1237 (THR-6): Tab onto the group and modifier-Enter/Escape on the focused block; real focus.
- Hover reveal plays (styled/thread.stories.tsx:162, primitives/action-bar/action-bar.stories.tsx:146,
  styled/action-bar.stories.tsx:47): visibility comes from UnoCSS opacity classes; happy-dom has no generated CSS, so
  `toBeVisible` would pass or fail for the wrong reason.
- styled/action-bar.stories.tsx:47: relies on Chromium refusing `navigator.clipboard.writeText` without permission;
  happy-dom's clipboard resolves, which flips the asserted "Copy failed".
- thread:362 (reduced motion): needs real media emulation; the old hand stub of `window.matchMedia` is a stub, banned
  by rule 2. Decision K6 picks where the real media query comes from.
- Suspected blockers for any Thread render in happy-dom (none of these rows moved there, listed for whoever tries):
  Ark/zag collapsible presence reads computed `animationName`; the thread's bottom pin uses ResizeObserver and
  scroll geometry; markdown text goes through solid-streamdown (Shiki/WASM for code fences).

---

# Part: cards

# Part 3: ui-kit-chat cards, markdown, node file and tool stories

Worktree /Users/omrikatz/Public/web/aidx-wt-test-split (origin/main 86d94e743). Every file below read in full. Line numbers are the worktree's. Audit hints (test-audit-ui-kit-chat-cards.md, -rest.md) were made at 51708bc06 and their line numbers are stale; several cards tests changed since (the dispatch "accepts chain" test is gone, the approval tests now assert the ask is NOT on the card).

Ground rule used here: every component in these files is a published or internal ui-kit-chat kit component mounted alone with a hand-built part and an inert ctx. None needs the engine or the app shell, so nothing goes to happy-dom (apps/conciv) or happy-dom (plugin). Most need real layout, shadow DOM, workers or tooltips (see the last section), and Storybook already runs in real Chromium, so the kit behaviour goes to story.

New story files the merges need (wave 4): `src/tools/styled/tool-call-card.stories.tsx` (ToolTraceRow / ToolCallCard), `src/tools/styled/tool-display.stories.tsx` (ToolDisplay / ToolPartRow), `src/tools/styled/result-image.stories.tsx`. New stories inside existing files are named per row.

### packages/ui-kit-chat/test/cards.browser.test.tsx (50 rows, 51 tests)

| test (file:line + short title)                                                                      | destination    | target (package/file or owner)                                                                                                                            | merge-id | why (one short clause)                                                                                                                |
| --------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| cards:57 MetaToolCard zero-input tool shows "no input"                                              | story          | meta-tool-card.stories.tsx, new story "Inputs"                                                                                                            | CRD-1    | one card's input states                                                                                                               |
| cards:71 MetaToolCard shows an undeclared input key                                                 | story          | meta-tool-card.stories.tsx "Inputs"                                                                                                                       | CRD-1    | same card, second input state                                                                                                         |
| cards:86 MetaToolCard shows input of a tool with no schema                                          | story          | meta-tool-card.stories.tsx "Inputs"                                                                                                                       | CRD-1    | same card, third input state                                                                                                          |
| cards:101 MetaToolCard error block beside input chips                                               | story          | meta-tool-card.stories.tsx, new story "ErrorDecoding"                                                                                                     | CRD-2    | one error rendering state                                                                                                             |
| cards:116 ToolFallback zero-argument call shows "no input"                                          | story          | tool-fallback.stories.tsx, new story "NoArguments"                                                                                                        | CRD-3    | fallback card state, no story has it                                                                                                  |
| cards:163 generic card draws its own body under its header (catalog + fallback)                     | story          | meta-tool-card.stories.tsx ReadTool:77 (add result + chip asserts)                                                                                        | CRD-1    | ReadTool already proves headline and expand; fallback half is tool-fallback.stories Complete:25                                       |
| cards:187 unclaimed call keeps result folded, call with no result is disabled                       | story          | new tool-display.stories.tsx                                                                                                                              | CRD-4    | ToolDisplay row states                                                                                                                |
| cards:218 CollapsibleCard expands on click                                                          | DELETE-COVERED | meta-tool-card.stories.tsx ReadTool:88 (opens the card) and tool-card.stories.tsx ApprovalSettlesInPlace:48 (header toggles aria-expanded)                | -        | CollapsibleCard is internal, only reached through ToolCard                                                                            |
| cards:235 CollapsibleCard title tooltip on trigger row                                              | DELETE-COVERED | meta-tool-card.stories.tsx TitleTooltip:157 (ToolCard passes titleTooltip to CollapsibleCard tooltip, tool-card.tsx:166)                                  | -        | same prop path                                                                                                                        |
| cards:249 CollapsibleSection opens and closes                                                       | story          | collapsible-section.stories.tsx NestedInsideCardBody:18 (add the second click that closes)                                                                | CRD-5    | play already proves closed then open                                                                                                  |
| cards:287 CardShell embedded drops header and "no input"                                            | story          | card-shell.stories.tsx, new story "EmbeddedVsStandalone"                                                                                                  | CRD-6    | chrome variant state                                                                                                                  |
| cards:300 CardShell embedded drops the chip row                                                     | story          | card-shell.stories.tsx "EmbeddedVsStandalone"                                                                                                             | CRD-6    | same                                                                                                                                  |
| cards:312 CardShell standalone keeps header, chips, "no input"                                      | story          | card-shell.stories.tsx "EmbeddedVsStandalone"                                                                                                             | CRD-6    | the contrast half                                                                                                                     |
| cards:324 InlineShell embedded drops name and glyph                                                 | story          | card-shell.stories.tsx "EmbeddedVsStandalone"                                                                                                             | CRD-6    | same chrome provider                                                                                                                  |
| cards:336 InlineShell standalone keeps name                                                         | story          | card-shell.stories.tsx "EmbeddedVsStandalone"                                                                                                             | CRD-6    | contrast half                                                                                                                         |
| cards:383 declared error code shows the declared message                                            | DELETE-DUP     | meta-tool-card.stories.tsx DeclaredError:115 (play :125), same page_fill / NO_MATCH / "page_fill failed" fixture                                          | -        | play proves exactly this                                                                                                              |
| cards:398 unknown code falls through to payload message                                             | story          | meta-tool-card.stories.tsx "ErrorDecoding"                                                                                                                | CRD-2    | error decode row                                                                                                                      |
| cards:413 non-JSON "NO_MATCH: ..." text stays raw                                                   | story          | meta-tool-card.stories.tsx "ErrorDecoding"                                                                                                                | CRD-2    | error decode row                                                                                                                      |
| cards:428 code-mode string envelope decodes declared code                                           | story          | meta-tool-card.stories.tsx "ErrorDecoding"                                                                                                                | CRD-2    | error decode row; decoder is module-private (meta-tool-card.tsx:46-69), a node would need a new export                                |
| cards:444 a JSON.stringify'd string result renders the plain string, not raw quotes (no row before) | DELETE-DUP     | ui-kit-chat-tools.browser.test.tsx:300 (its row goes to the new `StringResult` story of packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx) | -        | same string result shape; the cross-file duplicates below already pair them                                                           |
| cards:463 catalog tool denied/cancelled reads as outcome in trace row (each x2)                     | story          | new tool-call-card.stories.tsx "TraceRowBodies"                                                                                                           | CRD-7    | only proof for the catalog (MetaToolCard) body path; conciv:8141/8148 and chat-tools:665 use builtin cards                            |
| cards:501 object result opens as json tree                                                          | story          | meta-tool-card.stories.tsx, new story "ObjectResult"                                                                                                      | -        | object result takes the ShapedValue path (meta-tool-card.tsx:92), NestedListResult:133 covers only the array-of-objects JsonTree path |
| cards:540 PermissionCard Allow replies once, no session actions                                     | story          | permission-card.stories.tsx Pending:26 (add: no "Allow for session"/"Always allow", reply shown is once)                                                  | CRD-11   | play already clicks Allow and sees the decision                                                                                       |
| cards:587 extension card wins over builtin for same tool                                            | DELETE-COVERED | apps/conciv/test/conciv.browser.test.tsx:4306 (later plugin wins a name)                                                                                  | -        | "extension" is a dead concept; order rule proved in the real pane                                                                     |
| cards:601 builtin card wins over meta default card                                                  | DELETE-COVERED | conciv.browser.test.tsx:4083 and :4104 (plugin card, not the generic card)                                                                                | -        | real pane owns dispatch                                                                                                               |
| cards:615 meta default card wins over raw fallback                                                  | DELETE-COVERED | conciv.browser.test.tsx:4166 (page tools read label from the catalog)                                                                                     | -        | real pane owns dispatch                                                                                                               |
| cards:629 unknown tool reaches raw fallback "Called x"                                              | DELETE-COVERED | conciv.browser.test.tsx:9061 ("Called server_urls" from a real turn)                                                                                      | -        | real pane owns it                                                                                                                     |
| cards:643 approval-requested ToolCallCard draws no ask, the dock owns it                            | story          | new tool-call-card.stories.tsx "ApprovalAskNotOnCard"                                                                                                     | -        | one card state; see tension with tool-fallback.stories Approval:76 below                                                              |
| cards:671 ToolCard auto-opens while streaming, collapses on settle                                  | story          | tool-card.stories.tsx, new story "AutoOpenFollowsStream" (harness buttons like ApprovalSettlesInPlace)                                                    | CRD-10   | one card, simple clicks                                                                                                               |
| cards:690 user-opened card stays open after settle                                                  | story          | tool-card.stories.tsx "AutoOpenFollowsStream"                                                                                                             | CRD-10   | user override step                                                                                                                    |
| cards:706 user-collapsed card stays closed while streaming                                          | story          | tool-card.stories.tsx "AutoOpenFollowsStream"                                                                                                             | CRD-10   | user override step                                                                                                                    |
| cards:727 pending approval opens, collapses once resolved to complete                               | story          | tool-card.stories.tsx "AutoOpenFollowsStream"                                                                                                             | CRD-10   | complements ApprovalSettlesInPlace (approval-responded stays open)                                                                    |
| cards:756 card summary owns the hover over the title                                                | DELETE-DUP     | meta-tool-card.stories.tsx TitleTooltip:157 (play :167)                                                                                                   | -        | same summary-tooltip on hover; test also walks DOM by data-scope                                                                      |
| cards:770 clipped card title is revealed on hover                                                   | story          | tool-card.stories.tsx, new story "ClippedTitleReveals"                                                                                                    | -        | needs real truncation (scrollWidth)                                                                                                   |
| cards:804 ToolFallback object args as json tree, not shiki                                          | story          | tool-fallback.stories.tsx Complete:25 (assert role tree for args)                                                                                         | CRD-3    | play already opens the body                                                                                                           |
| cards:828 generic projection for a tool with no row                                                 | DELETE-COVERED | conciv.browser.test.tsx:9061 (generic row, label input as target, args beside)                                                                            | -        | real pane owns it                                                                                                                     |
| cards:847 generic body mounts json tree + shiki result, no click                                    | story          | tool-call-card.stories.tsx "TraceRowBodies"                                                                                                               | CRD-7    | trace row body state; drop diffs-container count                                                                                      |
| cards:862 fold body away and back from row control                                                  | story          | tool-call-card.stories.tsx "TraceRowBodies"                                                                                                               | CRD-7    | simple click                                                                                                                          |
| cards:903 long body clamps, "24 more lines" / "Show less"                                           | story          | tool-call-card.stories.tsx, new story "LongOutputClamps"                                                                                                  | CRD-8    | TraceClamp measures with ResizeObserver                                                                                               |
| cards:919 short body has no clamp footer                                                            | story          | tool-call-card.stories.tsx "LongOutputClamps"                                                                                                             | CRD-8    | contrast half; rewrite button textContent scan to queryByRole                                                                         |
| cards:936 hasEmbeddedBody false leaves row disabled                                                 | story          | tool-call-card.stories.tsx "TraceRowBodies"                                                                                                               | CRD-7    | inert row state                                                                                                                       |
| cards:949 declared body mounts with no args and no result                                           | story          | tool-call-card.stories.tsx "TraceRowBodies"                                                                                                               | CRD-7    | row state                                                                                                                             |
| cards:957 nothing to show leaves row disabled                                                       | story          | tool-call-card.stories.tsx "TraceRowBodies"                                                                                                               | CRD-7    | row state                                                                                                                             |
| cards:964 approval row free of the ask; block approves                                              | story          | tool-call-card.stories.tsx "TraceRowBodies" (row half only)                                                                                               | CRD-7    | TracePermissionBlock half is DELETE-DUP of thread.browser.test.tsx:1182 and permission-block.stories Answered:76                      |
| cards:1021 embedded card header projected onto row, failed mark                                     | story          | tool-call-card.stories.tsx, new story "RowTakesCardHeader"                                                                                                | CRD-9    | row/card header state                                                                                                                 |
| cards:1053 denied result names outcome on row, not "failed"                                         | DELETE-DUP     | apps/conciv/test/conciv.browser.test.tsx:8159 (denied Grep names outcome on row, never failed)                                                            | -        | same asserts one level up                                                                                                             |
| cards:1095 card title on row, subtitle stays in body                                                | story          | tool-call-card.stories.tsx "RowTakesCardHeader"                                                                                                           | CRD-9    | header state; drop .elements() count                                                                                                  |
| cards:1133 row header follows result as it streams                                                  | story          | tool-call-card.stories.tsx "RowTakesCardHeader" (button sets result)                                                                                      | CRD-9    | one prop change                                                                                                                       |
| cards:1162 named argument stays target, badge from header                                           | story          | tool-call-card.stories.tsx "RowTakesCardHeader"                                                                                                           | CRD-9    | header state                                                                                                                          |
| cards:1186 failed rows: title, subtitle, error summary, Copy error                                  | story          | new tool-display.stories.tsx "FailedRows"                                                                                                                 | CRD-4    | ToolDisplay / ToolPartRow states                                                                                                      |

Totals: story 39, DELETE-DUP 4, DELETE-COVERED 7. 50 rows.
File becomes: deleted. Its behaviour moves into plays (meta-tool-card, tool-fallback, card-shell, collapsible-section, permission-card, tool-card stories plus new tool-call-card and tool-display stories). Merge groups: CRD-1 inputs, CRD-2 error decoding, CRD-3 fallback, CRD-4 ToolDisplay rows, CRD-5 section, CRD-6 chrome, CRD-7 trace row bodies, CRD-8 clamp, CRD-9 row header, CRD-10 auto open, CRD-11 permission card.

### packages/ui-kit-chat/test/markdown.browser.test.tsx (11 rows)

| test (file:line + short title)                                                                          | destination    | target (package/file or owner)                                                                                                    | merge-id | why (one short clause)                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| markdown:36 CodeBlock grows line by line as contents stream                                             | story          | code-block.stories.tsx, new story "ContentsStream" (button appends a line)                                                        | MD-4     | @pierre/diffs shadow DOM + shiki worker                                                                                                                                                |
| markdown:52 copy a file block, expand a clipped log                                                     | story          | code-block.stories.tsx, new story "CopyAndExpand"                                                                                 | MD-4     | real clipboard and viewport; use CodeBlock `copy.writeText` (code-block.tsx:94) as a visible fake instead of readText                                                                  |
| markdown:78 finished fence headed by its language, copied from header                                   | story          | markdown.stories.tsx DeclinedClaimedFence:124 (click Copy, see "Copied to clipboard")                                             | MD-3     | play already asserts the ts group and its Copy button                                                                                                                                  |
| markdown:94 fence painted with shiki tokens                                                             | DELETE-COVERED | packages/embed/test/e2e/embed.it.test.ts:558 (real bundle highlights code); same `const` token assert also in markdown:270 (MD-3) | -        | repeats an assert in the same file                                                                                                                                                     |
| markdown:114 selection in a highlighted fence survives the next chunk                                   | story          | markdown.stories.tsx, new story "StreamingFence"                                                                                  | MD-1     | real Selection API + worker highlight                                                                                                                                                  |
| markdown:139 settled mermaid fence draws a diagram                                                      | story          | markdown.stories.tsx, new story "MermaidFence"                                                                                    | MD-2     | mermaid needs SVG layout                                                                                                                                                               |
| markdown:146 streaming mermaid stays code, draws on settle                                              | story          | markdown.stories.tsx "MermaidFence"                                                                                               | MD-2     | replace the second-fence barrier with a button that settles                                                                                                                            |
| markdown:160 unparseable mermaid stays a code block                                                     | story          | markdown.stories.tsx "MermaidFence"                                                                                               | MD-2     | fallback state                                                                                                                                                                         |
| markdown:206 provider passes file handlers and block content, codeBlocks false off, declined falls back | story          | markdown.stories.tsx DeclinedClaimedFence:124 (add the declined mermaid that still draws)                                         | MD-3     | the rest is DELETE-DUP of WithProvider:97 (chart render, decline, codeBlocks false, link opens) and solid-streamdown.browser.test.tsx:199 (Enter reopens, focus, missing path no link) |
| markdown:306 fenced block grows in one block as markdown streams                                        | story          | markdown.stories.tsx "StreamingFence"                                                                                             | MD-1     | rewrite to what the user sees (closing line visible, one ts group); drop setTimeout(16) and `.prose-chat pre`                                                                          |
| markdown:328 ResultImage names the img by alt                                                           | story          | new result-image.stories.tsx                                                                                                      | -        | one published component, misfiled here                                                                                                                                                 |

Totals: story 10, DELETE-COVERED 1. 11 rows.
File becomes: deleted; plays in markdown.stories.tsx (MD-1, MD-2, MD-3), code-block.stories.tsx (MD-4) and a new result-image story.

### packages/ui-kit-chat/test/ui-kit-chat.test.ts (39 rows, 44 tests)

| test (file:line + short title)                                | destination  | target (package/file or owner)                                            | merge-id | why (one short clause)                                                                                              |
| ------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| node:30 shortToolLabel splits names into a row label          | node (table) | packages/ui-kit-chat/src/tools/primitives/tool-row.test.ts                | KCN-1    | pure; it.each rows incl. the 400k input                                                                             |
| node:42 humanToolName names an mcp tool                       | node (table) | packages/ui-kit-chat/src/tools/primitives/now-title.test.ts               | KCN-1    | pure; it.each rows incl. the 720k input                                                                             |
| node:68 turnRollup reads edited files from patch headers      | node         | packages/ui-kit-chat/src/store/turn-rollup.test.ts                        | -        | pure; same 4 inputs as ui-kit-chat-tools.browser.test.tsx:41-52 against a second parser (code dup, pick one parser) |
| node:87 genericToolHeadline title + label key subtitle        | node         | packages/ui-kit-chat/src/tools/styled/generic-tool-headline.test.ts       | KCN-2    | table host                                                                                                          |
| node:96 first label key wins, never repeated as arg           | node         | packages/ui-kit-chat/src/tools/styled/generic-tool-headline.test.ts       | KCN-2    | table row                                                                                                           |
| node:108 no label key: first three scalars, first is target   | node         | packages/ui-kit-chat/src/tools/styled/generic-tool-headline.test.ts       | KCN-2    | table row                                                                                                           |
| node:118 skips objects, arrays, null                          | node         | packages/ui-kit-chat/src/tools/styled/generic-tool-headline.test.ts       | KCN-2    | table row                                                                                                           |
| node:127 empty, missing, broken input means no args           | node         | packages/ui-kit-chat/src/tools/styled/generic-tool-headline.test.ts       | KCN-2    | table rows                                                                                                          |
| node:137 fileMatchesAccept accept semantics                   | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-3    | table                                                                                                               |
| node:144 image adapter add then send gives data source        | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-4    | adapter journey host                                                                                                |
| node:166 same name and size get distinct ids                  | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-4    | one more add                                                                                                        |
| node:175 oversized image incomplete, send refuses             | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-4    | refusal table row                                                                                                   |
| node:184 svg image incomplete, send refuses                   | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-4    | refusal table row                                                                                                   |
| node:193 fileToDataSource octet-stream fallback               | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-3    | table row                                                                                                           |
| node:198 fileToDataSource infers image MIME from extension    | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-3    | table row                                                                                                           |
| node:203 text adapter sends a named text part                 | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-5    | composed test sends the same shape                                                                                  |
| node:219 composed adapters route add/send/remove              | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-5    | host                                                                                                                |
| node:238 composed rejects an unaccepted file                  | node         | packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.test.ts | KCN-5    | one more add                                                                                                        |
| node:265 formatElapsed mm:ss                                  | node (table) | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-6    | it.each row                                                                                                         |
| node:269 formatElapsed zero                                   | node (table) | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-6    | it.each row                                                                                                         |
| node:273 formatElapsed h:mm:ss                                | node (table) | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-6    | it.each row                                                                                                         |
| node:279 runClock null before any run                         | node (table) | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-7    | it.each row                                                                                                         |
| node:283 runClock ticks from receivedAt                       | node (table) | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-7    | it.each row                                                                                                         |
| node:288 runClock freezes on completed                        | node (table) | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-7    | it.each row                                                                                                         |
| node:294 runClock freezes on aborted                          | node (table) | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-7    | it.each row                                                                                                         |
| node:299 runClock continues from server start after reload    | node (table) | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-7    | it.each row                                                                                                         |
| node:304 runClock continuous across re-subscribe              | node         | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-7    | two rows, same expected                                                                                             |
| node:311 runClock clamps at 0 on backwards clock              | node (table) | packages/ui-kit-chat/src/store/run-clock.test.ts                          | KCN-7    | it.each row                                                                                                         |
| node:328 deriveSessionStatus unstarted/running/done/stopped   | node (table) | packages/ui-kit-chat/src/store/session-status.test.ts                     | -        | it.each over 4 inputs; conciv status-chip repeats are the ones to trim                                              |
| node:371 diffTurns from empty equals coalesceTurns (each x6)  | node         | packages/ui-kit-chat/src/store/grouping.test.ts                           | KCN-8    | oracle table                                                                                                        |
| node:376 diffTurns from a previous state equals coalesceTurns | node         | packages/ui-kit-chat/src/store/grouping.test.ts                           | KCN-8    | one more row                                                                                                        |
| node:383 prepended page with same replies keeps own turn keys | node         | packages/ui-kit-chat/src/store/grouping.test.ts                           | KCN-8    | paging key edge (#742)                                                                                              |
| node:407 outside calls with runs get own turns                | node         | packages/ui-kit-chat/src/store/grouping.test.ts                           | KCN-9    | turn-bounds table host                                                                                              |
| node:419 run-less outside calls stay in one turn              | node         | packages/ui-kit-chat/src/store/grouping.test.ts                           | KCN-9    | table row                                                                                                           |
| node:424 compaction marker opens a turn                       | node         | packages/ui-kit-chat/src/store/grouping.test.ts                           | KCN-9    | table row                                                                                                           |
| node:438 in-place update returns the same group tree          | node         | packages/ui-kit-chat/src/store/grouping.test.ts                           | KCN-10   | structural sharing                                                                                                  |
| node:444 only the joined group is replaced                    | node         | packages/ui-kit-chat/src/store/grouping.test.ts                           | KCN-10   | same function                                                                                                       |
| node:454 approved act moves into page session group           | node         | packages/ui-kit-chat/src/store/page-session.test.ts                       | KCN-10   | regroup edge                                                                                                        |
| node:471 encodeAttachments shape, skip file-less, budget      | node         | packages/ui-kit-chat/src/draft-storage.test.ts                            | -        | only proof of the budget edge                                                                                       |

Totals: node 39. 39 rows.
File becomes: stays, shrinks from 489 to about 330 lines as it.each tables (KCN-1 to KCN-10).

### Story plays (under packages/ui-kit-chat/src/)

#### tools/styled/element-preview.stories.tsx (7 plays)

| test (file:line + short title)                        | destination | target (package/file or owner) | merge-id | why (one short clause)                                                   |
| ----------------------------------------------------- | ----------- | ------------------------------ | -------- | ------------------------------------------------------------------------ |
| element-preview:68 FullCapture                        | story       | stays                          | -        | snapshot frame renders the element                                       |
| element-preview:81 DescriptorOnly                     | story       | stays                          | -        | descriptor state                                                         |
| element-preview:96 BeforeAfterPair                    | story       | stays                          | -        | two frames                                                               |
| element-preview:115 MaskedField                       | story       | stays                          | -        | masked state                                                             |
| element-preview:128 FailedBuildDegradesToDescriptor   | story       | stays                          | -        | fallback state; replace `querySelector('[role="img"]')` with queryByRole |
| element-preview:144 DocumentNodeDegradesToDescriptor  | story       | stays                          | -        | fallback state; same querySelector fix                                   |
| element-preview:160 HostileHostCssStaysInsideTheFrame | story       | stays                          | -        | CSS isolation needs a real browser                                       |

Totals: story 7. Stays as is (two querySelector fixes).

#### tools/styled/meta-tool-card.stories.tsx (6 plays)

| test                                  | destination | target                                                      | merge-id | why                                  |
| ------------------------------------- | ----------- | ----------------------------------------------------------- | -------- | ------------------------------------ |
| meta-tool-card:77 ReadTool            | story       | stays; absorbs cards:163                                    | CRD-1    | headline, expand, summary, input key |
| meta-tool-card:98 MutatingTool        | story       | stays                                                       | -        | "page edit" badge                    |
| meta-tool-card:115 DeclaredError      | story       | stays; makes cards:383 DELETE-DUP                           | -        | declared error message               |
| meta-tool-card:133 NestedListResult   | story       | stays                                                       | -        | array-of-objects tree                |
| meta-tool-card:157 TitleTooltip       | story       | stays; makes cards:756 DELETE-DUP, cards:235 DELETE-COVERED | -        | summary tooltip                      |
| meta-tool-card:177 PositionalHeadline | story       | stays                                                       | -        | running headline                     |

Totals: story 6. Grows by new stories "Inputs" (CRD-1), "ErrorDecoding" (CRD-2), "ObjectResult".

#### tools/styled/chip.stories.tsx (6 plays)

| test                     | destination | target | merge-id | why                                 |
| ------------------------ | ----------- | ------ | -------- | ----------------------------------- |
| chip:16 FieldKind        | story       | stays  | -        | tones                               |
| chip:32 PillKind         | story       | stays  | -        | tones                               |
| chip:47 PillWithTooltip  | story       | stays  | -        | tooltip hover                       |
| chip:57 FieldWithTooltip | story       | stays  | -        | tooltip hover                       |
| chip:70 PillLongValue    | story       | stays  | -        | truncation reveal needs real layout |
| chip:85 FieldLongValue   | story       | stays  | -        | truncation reveal needs real layout |

Totals: story 6. Stays.

#### tools/styled/code-block.stories.tsx (5 plays)

| test                                      | destination | target | merge-id | why            |
| ----------------------------------------- | ----------- | ------ | -------- | -------------- |
| code-block:22 CodeBlockXs                 | story       | stays  | -        | size state     |
| code-block:30 CodeBlockSm                 | story       | stays  | -        | size state     |
| code-block:38 CodeBlockLongContentScrolls | story       | stays  | -        | log max height |
| code-block:47 DiffBlockXs                 | story       | stays  | -        | diff state     |
| code-block:65 DiffBlockSm                 | story       | stays  | -        | diff state     |

Totals: story 5. Stays, grows by "ContentsStream" and "CopyAndExpand" (MD-4). All five read `diffs-container` shadowRoot textContent (DOM read, rule 8): testing-library cannot pierce the shadow root, so either the kit exposes the code as an accessible name/region or this read gets a named exception.

#### tools/styled/tool-fallback.stories.tsx (3 plays; Running:46 has no play)

| test                      | destination | target                   | merge-id | why                                                                                                                                                               |
| ------------------------- | ----------- | ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tool-fallback:25 Complete | story       | stays; absorbs cards:804 | CRD-3    | name, duration, result                                                                                                                                            |
| tool-fallback:58 Errored  | story       | stays                    | -        | error state                                                                                                                                                       |
| tool-fallback:76 Approval | story       | stays                    | -        | bare published ToolFallback still shows Allow/Deny (tool-fallback.tsx:107); through ToolCallCard it does not (cards:643). Confirm the bare prompt is still wanted |

Totals: story 3. Grows by "NoArguments" (CRD-3).

#### tools/styled/error-block.stories.tsx (3 plays)

| test                       | destination | target | merge-id | why                                |
| -------------------------- | ----------- | ------ | -------- | ---------------------------------- |
| error-block:14 Default     | story       | stays  | -        | default label                      |
| error-block:23 CustomLabel | story       | stays  | -        | custom label                       |
| error-block:37 LongMessage | story       | stays  | -        | wrap state (play only checks text) |

Totals: story 3. Stays.

#### tools/styled/collapsible-section.stories.tsx (3 plays)

| test                                        | destination | target                                     | merge-id | why        |
| ------------------------------------------- | ----------- | ------------------------------------------ | -------- | ---------- |
| collapsible-section:18 NestedInsideCardBody | story       | stays; absorbs cards:249 (add close click) | CRD-5    | toggle     |
| collapsible-section:40 DefaultOpen          | story       | stays                                      | -        | open state |
| collapsible-section:58 LongContent          | story       | stays                                      | -        | long body  |

Totals: story 3. Stays.

#### tools/styled/card-shell.stories.tsx (3 plays)

| test                                 | destination | target | merge-id | why              |
| ------------------------------------ | ----------- | ------ | -------- | ---------------- |
| card-shell:22 LongTitleNoSubtitle    | story       | stays  | -        | truncation state |
| card-shell:30 LongTitleWithSubtitle  | story       | stays  | -        | truncation state |
| card-shell:42 ShortTitleLongSubtitle | story       | stays  | -        | truncation state |

Totals: story 3. Grows by "EmbeddedVsStandalone" (CRD-6).

#### tools/styled/action-row.stories.tsx (3 plays)

| test                    | destination | target | merge-id | why                                                                                 |
| ----------------------- | ----------- | ------ | -------- | ----------------------------------------------------------------------------------- |
| action-row:14 AllowDeny | story       | stays  | -        | uses `fn()` spies it never asserts; rule 4: render a visible decision and assert it |
| action-row:37 Neutral   | story       | stays  | -        | neutral buttons                                                                     |
| action-row:52 Disabled  | story       | stays  | -        | disabled state                                                                      |

Totals: story 3. Stays (AllowDeny rewritten without fn()).

#### tools/styled/permission-card.stories.tsx (2 plays)

| test                       | destination | target                   | merge-id | why                     |
| -------------------------- | ----------- | ------------------------ | -------- | ----------------------- |
| permission-card:26 Pending | story       | stays; absorbs cards:540 | CRD-11   | Allow decides           |
| permission-card:48 Settled | story       | stays                    | -        | no buttons once settled |

Totals: story 2. Stays. Pending's `data-decided` div is a test-only attribute; harmless, not a locator.

#### tools/styled/tool-card.stories.tsx (1 play)

| test                                | destination | target | merge-id | why                                                               |
| ----------------------------------- | ----------- | ------ | -------- | ----------------------------------------------------------------- |
| tool-card:46 ApprovalSettlesInPlace | story       | stays  | CRD-10   | approval opens, stays on approval-responded, folds on next prompt |

Totals: story 1. Grows by "AutoOpenFollowsStream" (CRD-10) and "ClippedTitleReveals".

#### tools/primitives/status-visual.stories.tsx (2 plays; BothForms:57 has no play)

| test                      | destination | target | merge-id | why                        |
| ------------------------- | ----------- | ------ | -------- | -------------------------- |
| status-visual:37 DotForm  | story       | stays  | -        | every status names its img |
| status-visual:47 IconForm | story       | stays  | -        | same names, other form     |

Totals: story 2. Stays.

#### styled/markdown.stories.tsx (3 plays)

| test                                      | destination | target                                                                   | merge-id | why                                                                                              |
| ----------------------------------------- | ----------- | ------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| markdown.stories:29 ProseRamp             | story       | stays                                                                    | -        | headings and inline code                                                                         |
| markdown.stories:97 WithProvider          | story       | stays; makes most of markdown:206 a dup                                  | MD-3     | provider plumbing; `fenceText` reads diffs-container shadowRoot (same rule-8 note as code-block) |
| markdown.stories:124 DeclinedClaimedFence | story       | stays; absorbs markdown:78 and the declined-mermaid half of markdown:206 | MD-3     | declined fence falls back                                                                        |

Totals: story 3. Grows by "StreamingFence" (MD-1) and "MermaidFence" (MD-2).

Story rows total: 47 (element-preview 7, meta-tool-card 6, chip 6, code-block 5, tool-fallback 3, error-block 3, collapsible-section 3, card-shell 3, action-row 3, permission-card 2, tool-card 1, status-visual 2, markdown 3). No play is deleted.

## Cross-file duplicates (pairs, file:line <-> file:line)

Browser tests a story play already duplicates (decision 5):

- cards.browser.test.tsx:383 <-> meta-tool-card.stories.tsx:115 DeclaredError (play :125): same page_fill / NO_MATCH fixture, same absent "page_fill failed". DELETE-DUP.
- cards.browser.test.tsx:756 <-> meta-tool-card.stories.tsx:157 TitleTooltip (play :167): summary tooltip owns the title hover. DELETE-DUP.
- cards.browser.test.tsx:235 <-> meta-tool-card.stories.tsx:157 TitleTooltip: same CollapsibleCard tooltip prop through ToolCard. DELETE-COVERED.
- cards.browser.test.tsx:218 <-> meta-tool-card.stories.tsx:77 ReadTool and tool-card.stories.tsx:46 ApprovalSettlesInPlace: card opens on click. DELETE-COVERED.
- markdown.browser.test.tsx:206 <-> markdown.stories.tsx:97 WithProvider and :124 DeclinedClaimedFence: chart render/decline, codeBlocks false, link opens, declined ts falls back. Remaining unique bit (declined mermaid still draws) merges into the play.
- Partial (play absorbs the extra step, browser test then deleted): cards:249 <-> collapsible-section.stories.tsx:18; cards:540 <-> permission-card.stories.tsx:26; cards:804 <-> tool-fallback.stories.tsx:25; cards:163 <-> meta-tool-card.stories.tsx:77 + tool-fallback.stories.tsx:25; markdown:78 <-> markdown.stories.tsx:124.

Other cross-file pairs:

- cards.browser.test.tsx:444 <-> packages/ui-kit-chat-tools/test/ui-kit-chat-tools.browser.test.tsx:300 (page_ship, `JSON.stringify('shipped-42')`).
- cards.browser.test.tsx:1053 <-> apps/conciv/test/conciv.browser.test.tsx:8159 (denied Grep TODO names outcome on row, never "failed").
- cards.browser.test.tsx:964 (TracePermissionBlock half) <-> packages/ui-kit-chat/test/thread.browser.test.tsx:1182 and styled/trace/permission-block.stories.tsx:76 Answered.
- cards.browser.test.tsx:587/601/615/629/828 <-> conciv.browser.test.tsx:4306, 4083, 4104, 4166, 9061 (dispatch and generic card in the real pane).
- cards.browser.test.tsx:463 overlaps conciv.browser.test.tsx:8141/8148 and ui-kit-chat-tools.browser.test.tsx:665, but those use builtin cards; the catalog-card outcome path is only in cards:463, so it stays (CRD-7).
- meta-tool-card.stories.tsx:115 DeclaredError overlaps ui-kit-chat-tools.browser.test.tsx:283 (different fixture, registry catalog path); chat-tools keeps it as the registry wiring.
- markdown.browser.test.tsx:94 <-> packages/embed/test/e2e/embed.it.test.ts:558 and markdown.browser.test.tsx:270.
- markdown.browser.test.tsx:206 link click/Enter/missing path <-> packages/solid-streamdown/test/solid-streamdown.browser.test.tsx:199.
- ui-kit-chat.test.ts:68 <-> ui-kit-chat-tools.browser.test.tsx:41-52: same four patch strings against two parsers (`turnRollup` vs `patchInfo`/`parseClaudePatchBlocks`). Code duplicate; one parser should go.

## Plugin-owned tests (tests that a plugin should own, if any)

None. The cards fixtures borrow plugin tool names (`tanstack_query_cache`, `tanstack_route_tree`, `test_runner_run`, `page_*`) only as labels for hand-made cards; they prove kit rendering, not plugin behaviour.

## Cannot move to happy-dom (looks like it could, but needs X) and suspected happy-dom blockers

All rows above go to story (real Chromium) or node, so none is planned for happy-dom. If someone tries to move them to happy-dom, these block:

- Ark tooltip opening on hover (cards:235, 756, 770; chip, meta-tool-card TitleTooltip): floating-ui positions from getBoundingClientRect (zeros in happy-dom) and pointer-move open delay.
- Truncation reveal (cards:770, chip PillLongValue/FieldLongValue, card-shell stories): `TruncatedText` decides by measured overflow; no layout in happy-dom.
- TraceClamp "N more lines" (cards:903, 919): `makeResizeObserver` measures height (styled/trace/clamp.tsx:55); happy-dom has no real ResizeObserver sizes.
- CodeBlock / DiffBlock and the generic result body (cards:847, markdown:36, 52, code-block stories): `@pierre/diffs` `diffs-container` custom element with shadow DOM plus a shiki worker; happy-dom has no Worker.
- Markdown highlight (markdown:94, 114, 306, 206): inline highlight worker.
- Mermaid (markdown:139-160): SVG getBBox / text measurement.
- Selection kept across streaming (markdown:114): real Selection over re-rendered text nodes.
- Clipboard and toBeInViewport (markdown:52, 78): permissions and real viewport.
- ElementPreview (all 7 plays): renders a captured DOM with isolated CSS; the hostile-CSS play needs real cascade and hit testing.
- Looks movable but is not needed there: the node file's attachment adapters use `File`/`btoa`, already fine in plain node (node, no DOM).

---

# Part: chat-tools

# Part 4: ui-kit-chat-tools (browser test + story plays)

Worktree /Users/omrikatz/Public/web/aidx-wt-test-split (origin/main 86d94e743). Line numbers are from the worktree.

Facts checked before ruling:

- The audit note "catalog fixtures are built on `@conciv/extension`" is stale: `test/helpers.tsx` now builds `FIXTURE_TOOLS` / `fixtureRegistry` / `registryCatalogView` by hand from `ToolViewMeta` (no extension import). They are test-only fixtures.
- `builtinToolCards` (this kit) is consumed by the app shell directly: `apps/conciv/src/pane/chat-pane.tsx:41,287`. No plugin renders these cards, so no row here is plugin-owned.
- `MetaToolCard`, `ToolTraceRow`, `nowTitle`, `toolIconRender` live in `@conciv/ui-kit-chat/tools`, not this kit. `MetaToolCard` already has plays in `packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx` (ReadTool :77, MutatingTool :98, DeclaredError :115, NestedListResult :133, TitleTooltip :157, PositionalHeadline :177).
- `trace-gallery.stories.tsx` (this kit) renders `ToolTraceRow` over `builtinToolCards` (Bash :63, BashAnsiOutput :94, BashFailed :101, ApplyPatch :113, FileRead :117, FileEdit :127, Search :157, SearchFailed :167) but has NO play. It is the natural home for the trace-row projection plays.
- `InlineTool` (inline-tool.tsx) is exported from `src/index.tsx` and used only by its story: published kit API, kept.
- The package has no node test file; the budget allows one. The three pure-function tests below go there.
- New test since the audit: `:731` (long bash output head, copy, expand).

### packages/ui-kit-chat-tools/test/ui-kit-chat-tools.browser.test.tsx (37 tests)

| test (file:line + short title)                                                                                             | destination    | target (package/file or owner)                                                                                                                     | merge-id | why (one short clause)                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| :40 patch headers: reads a file only from the header line itself                                                           | node (table)   | packages/ui-kit-chat-tools/src/primitives/tools/apply-patch.test.ts `patchInfo` / `parseClaudePatchBlocks` it.each (named, unnamed, padded, blank) | TLS-1    | pure parser; same 4 inputs also hit `turnRollup`'s parser at ui-kit-chat.test.ts:68 (two parsers of one header)                                                         |
| :69 standalone outcome headers: a standalone ${outcome} Search and Bash card header shows a status, not an error (each x2) | story          | search-card.stories.tsx + bash-card.stories.tsx: new Denied / Cancelled stories with play                                                          | TLS-2    | one card's stopped state; same rule as :665 at the trace row                                                                                                            |
| :107 card body floor: search card names the running state                                                                  | story          | search-card.stories.tsx:82 Running (add play: expand, "searching…")                                                                                | TLS-3    | existing story already renders this state, only lacks the play                                                                                                          |
| :121 card body floor: search card reports no matches                                                                       | story          | search-card.stories.tsx:49 NoMatches (extend play: expand, "no matches")                                                                           | TLS-3    | story already mounts the empty result, only asserts the header "0 matches"                                                                                              |
| :135 card body floor: tool lookup card reports a missing query                                                             | story          | tool-lookup-card.stories.tsx: new NoQuery story                                                                                                    | TLS-3    | one card's empty state                                                                                                                                                  |
| :149 card body floor: todo card reports an empty list                                                                      | story          | todo-card.stories.tsx: new Empty story                                                                                                             | TLS-3    | one card's empty state                                                                                                                                                  |
| :163 card body floor: file read card reports the pending file                                                              | story          | file-read-card.stories.tsx: new Streaming story (input-streaming, no path)                                                                         | TLS-3    | one card's streaming state; Running :82 has a path so differs                                                                                                           |
| :250 catalog cards: a non-builtin registry tool renders its declared labels and positional argument                        | node (table)   | packages/ui-kit-chat/src/tools/primitives/now-title.test.ts (ui-kit-chat.test.ts), `nowTitle` it.each (running label, done label + positional)     | TLS-4    | DOM half (done label + positional) already a play at meta-tool-card.stories.tsx:77 ReadTool and :177 PositionalHeadline; the `nowTitle` half is pure                    |
| :266 catalog cards: a mutating registry tool shows its write badge and its hint                                            | story          | packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx:98 MutatingTool (extend play: expand, hint text)                                  | TLS-5    | badge already asserted there; hint is the only new assert                                                                                                               |
| :283 catalog cards: declared error renders the declared message instead of the raw failure                                 | DELETE-DUP     | packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx:115 DeclaredError (also cards.browser.test.tsx:383)                               | -        | same declared-code to message, raw string absent                                                                                                                        |
| :300 catalog cards: a string output schema renders the result as a code block                                              | story          | packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx: new StringResult story                                                           | TLS-6    | one component's output-shape state; cards.browser.test.tsx:444 proves the same and goes with it                                                                         |
| :316 catalog cards: a scalar output schema renders the result as a chip                                                    | story          | packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx: new ScalarResult story                                                           | TLS-6    | one component's output-shape state                                                                                                                                      |
| :332 catalog cards: a declared tool with no cosmetics renders its summary as the title                                     | story          | packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx: new NoCosmetics story                                                            | TLS-7    | title fallback branch of one component                                                                                                                                  |
| :384 new tool projection: a newly declared capability reaches the widget through its own declaration                       | DELETE-DUP     | :250 (same `page_ship` done and running titles); `catalog.get` half reads the test's own fixture                                                   | -        | identical title asserts                                                                                                                                                 |
| :402 new tool projection: card and running title read a registered declaration through the default source                  | node (table)   | packages/ui-kit-chat/src/tools/styled/tool-icon.test.ts `toolIconRender` it.each (declared key gives its icon)                                     | TLS-8    | titles dup :539/:250; only the icon assert is new and it is pure                                                                                                        |
| :421 new tool projection: a declaration with no icon key falls back to the generic icon                                    | node (table)   | packages/ui-kit-chat/src/tools/styled/tool-icon.test.ts `toolIconRender` it.each (undefined gives `GENERIC_TOOL_ICON`)                             | TLS-8    | pure function; the summary half reads the test fixture                                                                                                                  |
| :456 registered tool cards: titles a click with the declared label and promotes the selector                               | DELETE-DUP     | packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx:77 ReadTool (done label + positional selector)                                    | -        | same title rule, another fixture                                                                                                                                        |
| :469 registered tool cards: titles a fill and chips the typed value                                                        | story          | packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx:98 MutatingTool (page_fill with value; extend play: expand, value chip)           | TLS-5    | title already asserted there; value chip is the new assert                                                                                                              |
| :484 registered tool cards: titles a tree read verb                                                                        | DELETE-DUP     | :539 loop (covers every fixture verb incl. `tree`)                                                                                                 | -        | same assert                                                                                                                                                             |
| :490 registered tool cards: titles a press and chips the pressed key                                                       | story          | packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx:98 MutatingTool play (one value-chip assert covers it)                            | TLS-5    | same non-positional input chip rule as :469                                                                                                                             |
| :500 registered tool cards: falls back to the bare tool name when the catalog declares nothing                             | story          | packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx: new Undeclared story                                                             | TLS-7    | MetaToolCard's own unknown-name fallback                                                                                                                                |
| :531 registry card declarations: every registry tool declares a label and a non-generic icon                               | DELETE-NOTHING | -                                                                                                                                                  | -        | checks the test helper's own `FIXTURE_TOOLS`, not a product catalog                                                                                                     |
| :539 registry card declarations: card titles every registry tool from its declaration                                      | node (table)   | packages/ui-kit-chat/src/tools/primitives/now-title.test.ts `nowTitle` it.each                                                                     | TLS-4    | the loop over test fixtures re-proves one rule; running title is pure, done title is the ReadTool play                                                                  |
| :553 registry card declarations: representative cards render their declared titles and icons                               | DELETE-DUP     | :539 / :250 (and packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx:77 ReadTool)                                                     | -        | re-run of the title assert; asserts no icon despite its name                                                                                                            |
| :577 search matches > hiddenMatchSummary: does not count a file whose matches are all visible                              | node (table)   | packages/ui-kit-chat-tools/src/styled/tools/search-matches.test.ts `hiddenMatchSummary` it.each                                                    | TLS-1    | pure function                                                                                                                                                           |
| :616 tool row projections: successful bash call as a passing bash row with exit code                                       | story          | trace-gallery.stories.tsx:63 Bash (add play)                                                                                                       | TLS-9    | ToolTraceRow over builtin cards, one state                                                                                                                              |
| :625 tool row projections: nonzero bash exit as a failing row with Error output                                            | story          | trace-gallery.stories.tsx:101 BashFailed (add play)                                                                                                | TLS-9    | story already renders this state; thread.browser.test.tsx:1084 duplicates it                                                                                            |
| :640 tool row projections: bash result holding ${shape} renders as plain text (each x2)                                    | story          | trace-gallery.stories.tsx: new BashUnshapedResult story with args table                                                                            | TLS-9    | one row state, two inputs                                                                                                                                               |
| :665 tool row projections: a ${outcome} ${name} card body says the outcome with its reason, not a failure (each x4)        | story          | trace-gallery.stories.tsx: new Stopped stories (Grep denied, Glob cancelled, Bash denied, Bash cancelled)                                          | TLS-2    | kit-owned outcome state; conciv.browser.test.tsx:8141/8148/8159 re-prove it in the app file                                                                             |
| :676 tool row projections: apply_patch as an edit row with +/- counts                                                      | story          | trace-gallery.stories.tsx:113 ApplyPatch (add play)                                                                                                | TLS-10   | file-row table; story renders it already                                                                                                                                |
| :684 tool row projections: Write as a write row and Edit as an edit row                                                    | story          | trace-gallery.stories.tsx:127 FileEdit (add play, add a Write row)                                                                                 | TLS-10   | same file-row table                                                                                                                                                     |
| :699 tool row projections: Read as a read row with its line count                                                          | story          | trace-gallery.stories.tsx:117 FileRead (add play)                                                                                                  | TLS-10   | same file-row table                                                                                                                                                     |
| :707 tool row projections: Grep as a search row over its pattern                                                           | story          | trace-gallery.stories.tsx:157 Search (add play)                                                                                                    | TLS-10   | same file-row table                                                                                                                                                     |
| :714 tool row projections: running tool call as a live row                                                                 | story          | trace-gallery.stories.tsx: new BashRunning story                                                                                                   | TLS-9    | one more state of the bash row                                                                                                                                          |
| :721 tool row projections: plain bash output goes through the code highlighter                                             | DELETE-DUP     | bash-card.stories.tsx:39 Complete (expands, reads the output from `diffs-container`) and trace-gallery.stories.tsx:81 BashBuildLog renders it      | -        | same BashCard body highlighter; test only adds a `diffs-container` DOM read                                                                                             |
| :731 tool row projections: long bash output heads with its command, copies from the header, expands hidden lines           | story          | trace-gallery.stories.tsx: new BashLongOutput story with play (Chromium)                                                                           | TLS-11   | one component interaction; needs real clamp layout (toBeInViewport) and clipboard, so a Chromium story, not happy-dom; generic clamp also at cards.browser.test.tsx:903 |
| :758 tool row projections: ansi bash output never leaks escape codes                                                       | story          | bash-card.stories.tsx:85 AnsiOutput (extend play: contiguous "PASS src/app.test.ts"-style text, no escape)                                         | TLS-12   | the play renders ANSI but only checks substrings, not that escapes are gone                                                                                             |

Totals: story 23, node 6, DELETE-DUP 6 (:283, :384, :456, :484, :553, :721), DELETE-NOTHING 1 (:531), happy-dom/browser mode/node 0.
The file is deleted. Its pure rows become one new node file in this package (patch headers, hiddenMatchSummary) plus rows in ui-kit-chat.test.ts (`nowTitle`, `toolIconRender`); everything else becomes story plays (this kit's card and trace-gallery stories, ui-kit-chat's meta-tool-card stories). `test/helpers.tsx` goes with it.

### packages/ui-kit-chat-tools/src/styled/tools/search-card.stories.tsx (4 plays)

| test (file:line + short title)                             | destination | target (package/file or owner) | merge-id | why (one short clause)                    |
| ---------------------------------------------------------- | ----------- | ------------------------------ | -------- | ----------------------------------------- |
| :29 Matches: title, pattern, "2 matches", expand to code   | story       | stays                          | -        | the card's main state                     |
| :49 NoMatches: "0 matches"                                 | story       | stays, absorbs browser :121    | TLS-3    | header empty state; add body "no matches" |
| :65 Globbed: "Globbed" + glob                              | story       | stays                          | -        | glob variant                              |
| :98 Failed: failed label, error mark, expand to error text | story       | stays                          | -        | failure state                             |

Totals: story 4. Gains plays on Running :82 (browser :107) and new Denied/Cancelled stories (browser :69). Note: `codeText` reads `diffs-container` shadowRoot text, a DOM read; acceptable in a story but could use the rendered text instead.

### packages/ui-kit-chat-tools/src/styled/tools/discovered-apis-card.stories.tsx (4 plays)

| test (file:line + short title)                                    | destination | target (package/file or owner) | merge-id | why (one short clause) |
| ----------------------------------------------------------------- | ----------- | ------------------------------ | -------- | ---------------------- |
| :70 List: "Discovered 2 capabilities", expand lists entries       | story       | stays                          | -        | list state             |
| :82 Detail: "Inspected canvas_draw", description, type stub fence | story       | stays                          | -        | detail state           |
| :95 Empty: "Discovered 0 capabilities", "no APIs returned"        | story       | stays                          | -        | empty state            |
| :108 Unrecognized: "Capability catalog", "no APIs returned"       | story       | stays                          | -        | unknown payload state  |

Totals: story 4. No browser test covers this card; stays as is. `fenceText` reads `diffs-container` shadowRoot (DOM read).

### packages/ui-kit-chat-tools/src/styled/tools/file-read-card.stories.tsx (3 plays)

| test (file:line + short title)                                              | destination | target (package/file or owner) | merge-id | why (one short clause)                                                                                                                    |
| --------------------------------------------------------------------------- | ----------- | ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| :25 Read: title, expand, highlighted source with more than one token colour | story       | stays                          | -        | main state; the token-colour check reads inline `--diffs-token-light` styles, a CSS implementation assert to rewrite as visible text only |
| :50 WithRange: ":40-60"                                                     | story       | stays                          | -        | range variant                                                                                                                             |
| :66 Opened: "Opened src/app.tsx" (gone by 9d4f4834f)                        | not carried | -                              | -        | the FileReadCard `open` name was deleted in 0bc80ef1b; line 66 is now `Running`, which has no play                                        |

Totals: story 2, not carried 1. Gains a Streaming story (browser :163).

### packages/ui-kit-chat-tools/src/styled/tools/file-edit-card.stories.tsx (2 plays)

| test (file:line + short title)              | destination | target (package/file or owner) | merge-id | why (one short clause) |
| ------------------------------------------- | ----------- | ------------------------------ | -------- | ---------------------- |
| :27 Edited: "Edited sum.ts", expand to diff | story       | stays                          | -        | edit state             |
| :45 Wrote: "Wrote new.ts"                   | story       | stays                          | -        | write state            |

Totals: story 2. Unchanged.

### packages/ui-kit-chat-tools/src/styled/tools/bash-card.stories.tsx (2 plays)

| test (file:line + short title)                                                        | destination | target (package/file or owner)           | merge-id | why (one short clause)        |
| ------------------------------------------------------------------------------------- | ----------- | ---------------------------------------- | -------- | ----------------------------- |
| :29 Complete: "bash", description, expand to highlighted output headed by its command | story       | stays, absorbs browser :721 (DELETE-DUP) | -        | the highlighter proof         |
| :75 AnsiOutput: ANSI output text appears                                              | story       | stays, absorbs browser :758              | TLS-12   | add the no-escape-leak assert |

Totals: story 2. Gains Denied/Cancelled stories (browser :69). Error :49 and Running :61 have no play; Error state is proven at trace-gallery BashFailed (browser :625).

### packages/ui-kit-chat-tools/src/styled/tools/todo-card.stories.tsx (1 play)

| test (file:line + short title)                                        | destination | target (package/file or owner) | merge-id | why (one short clause) |
| --------------------------------------------------------------------- | ----------- | ------------------------------ | -------- | ---------------------- |
| :26 Complete: title, "1/3", expand shows active form and pending item | story       | stays                          | -        | main state             |

Totals: story 1. Gains Empty story (browser :149).

### packages/ui-kit-chat-tools/src/styled/tools/tool-lookup-card.stories.tsx (1 play)

| test (file:line + short title)                       | destination | target (package/file or owner) | merge-id | why (one short clause) |
| ---------------------------------------------------- | ----------- | ------------------------------ | -------- | ---------------------- |
| :23 Complete: "Loaded tools", expand shows the query | story       | stays                          | -        | main state             |

Totals: story 1. Gains NoQuery story (browser :135).

### packages/ui-kit-chat-tools/src/styled/tools/inline-tool.stories.tsx (1 play)

| test (file:line + short title)                                              | destination | target (package/file or owner) | merge-id | why (one short clause)                                         |
| --------------------------------------------------------------------------- | ----------- | ------------------------------ | -------- | -------------------------------------------------------------- |
| :25 Rows: read / edit / grep / failed lookup inline rows show their targets | story       | stays                          | -        | published kit API used only by stories (kept per group ruling) |

Totals: story 1. Unchanged.

### packages/ui-kit-chat-tools/src/styled/tools/apply-patch-diff.stories.tsx (1 play)

| test (file:line + short title)                           | destination | target (package/file or owner) | merge-id | why (one short clause)                                                                      |
| -------------------------------------------------------- | ----------- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| :32 Complete: "apply_patch sum.ts", "+3 −1", click opens | story       | stays                          | -        | main state; the open check reads `data-state`, better as aria-expanded or visible diff text |

Totals: story 1. Unchanged (trace-row edit counts, browser :676, go to trace-gallery ApplyPatch, a different component path).

## Cross-file duplicates (pairs, file:line <-> file:line)

Browser tests a play already duplicates (decision 5 candidates):

- ui-kit-chat-tools.browser.test.tsx:283 <-> packages/ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx:115 DeclaredError (also cards.browser.test.tsx:383)
- ui-kit-chat-tools.browser.test.tsx:456 <-> meta-tool-card.stories.tsx:77 ReadTool (done label + positional selector)
- ui-kit-chat-tools.browser.test.tsx:721 <-> bash-card.stories.tsx:39 Complete (highlighted output through `diffs-container`)
- ui-kit-chat-tools.browser.test.tsx:250 (DOM half) <-> meta-tool-card.stories.tsx:77 ReadTool and :177 PositionalHeadline; only its `nowTitle` half survives as node
- ui-kit-chat-tools.browser.test.tsx:266 (badge half) <-> meta-tool-card.stories.tsx:98 MutatingTool; only the hint assert moves into that play

Other duplicates:

- ui-kit-chat-tools.browser.test.tsx:665 (x4) <-> apps/conciv/test/conciv.browser.test.tsx:8141, :8148, :8159 (same `ToolTraceRow` + `builtinToolCards`, Bash/Grep/Glob denied or cancelled). The app copies render a kit component in the app's test file: DELETE-DUP there, owner is TLS-2 in trace-gallery.stories.tsx.
- ui-kit-chat-tools.browser.test.tsx:69 <-> conciv.browser.test.tsx:8141/8148 (denied/cancelled, not failed).
- ui-kit-chat-tools.browser.test.tsx:300 <-> packages/ui-kit-chat/test/cards.browser.test.tsx:444 (`JSON.stringify`'d string result shown plain).
- ui-kit-chat-tools.browser.test.tsx:625 <-> packages/ui-kit-chat/test/thread.browser.test.tsx:1084 (Error output frame on a failing bash row; per the thread audit).
- ui-kit-chat-tools.browser.test.tsx:731 <-> cards.browser.test.tsx:903 (clamp a long body, reveal from the block header; generic tool vs bash, the bash one adds command header and copy).
- ui-kit-chat-tools.browser.test.tsx:40 <-> packages/ui-kit-chat/test/ui-kit-chat.test.ts:68 (same four patch strings, two different header parsers: `patchInfo`/`parseClaudePatchBlocks` here, `turnRollup` there). Pick one parser.
- ui-kit-chat-tools.browser.test.tsx:384, :484, :553 <-> :250 / :539 (internal).

## Plugin-owned tests (tests that a plugin should own, if any)

None. `builtinToolCards` is wired by the app shell (`apps/conciv/src/pane/chat-pane.tsx:287`), not by a plugin, and every card here is a kit component. The `page_*` / `fixture_*` tool names in the catalog tests are hand-made test fixtures (`test/helpers.tsx`), not a plugin's declarations, so the page plugin owns none of them.

## Cannot move to happy-dom (looks like it could, but needs X) and suspected happy-dom blockers

Nothing here is ruled happy-dom, so happy-dom is not on the path; these notes are for anyone tempted to move the plays into a happy-dom file:

- Every expand-to-output assert (:625, :721, :758, :731, and the card stories Matches, Failed, Read, Edited, Complete, AnsiOutput, Detail) renders through the `diffs-container` custom element with a shadow root fed by Shiki (WASM/oniguruma grammar). Happy-dom custom-element + shadowRoot + Shiki WASM is a suspected blocker.
- :731 needs real layout: the 11-line clamp is asserted with `toBeInViewport`, and Copy uses `navigator.clipboard.readText()`. Both need Chromium (story play in Storybook's Chromium, or browser mode if it ever leaves the story).
- Card expand/collapse is an Ark Collapsible (zag): presence/animation state (`data-state`) depends on animation events; happy-dom does not run CSS animations, suspected flake source.
- file-read-card.stories.tsx:25 reads inline token colour styles from the shadow root: not portable and a CSS implementation assert; rewrite to visible text.

---

# Part: system

# Part 5: packages/ui-kit-system (browser file, node file, story plays)

Worktree /Users/omrikatz/Public/web/aidx-wt-test-split (origin/main 86d94e743). Every assigned file read in full. Line numbers are from the worktree. The audit (51708bc06) was a hint only: lines moved by up to about 20, and the browser file has one test the audit never saw (1035, "tooltip on a rising panel").

The ground rule for this package: it is a kit. A behaviour of one kit component (a state, a click, a key, real layout inside one component) goes to story. Storybook plays run in real Chromium, so layout, focus-visible and CSS animation work there. Pure math goes to the node file as node tables. Only the shadow-root, other-document and starved-frame cases stay in a small `ui-kit-system.browser.test.tsx` (browser mode). Nothing here goes to happy-dom happy-dom (no app shell, no engine).

Merge ids used:

- SYS-1: fitHeight table (node, node file)
- SYS-2: createClipboardCopy hook table with writers accept / refuse / throw, plus the copied window on fake timers (node, node file)
- SYS-3: TextArea autosize journey (story, text-field.stories.tsx: extend RefitsWhenWidthShrinks + Autosize; add one with padding, border, line-height normal, minRows/maxRows and a visible height report)
- SYS-5: ready-made Dialog layout (story, dialog.stories.tsx LongBody, today it has no play: last row and footer reachable, a long command scrolls inside)
- SYS-6: ready-made Dialog dismiss and name (story, dialog.stories.tsx ReadyMade, today it has no play: Escape, click behind, non-dismissable holds, role dialog named by its heading)
- SYS-7: dialog focus inside a shadow root (browser mode: nominated initial focus, focus back to a light-DOM opener, stacked parts in both modal modes)
- SYS-8: createResizable keyboard table (node, node file)
- SYS-9: skin contrast table (node, node file, beside the token-sheet checks; wcag.ts moves with it)
- SYS-10: TooltipIconButtonSlot as a menu trigger (story, new tooltip-icon-button story: hover then click hides tooltip, Tab shows it, Enter opens menu, Escape returns focus)
- SYS-11: copy buttons sharing a tooltip, both modes (story, clipboard-copy-button.stories.tsx new story with own and group tooltip: names by hovered tooltip, Copied on press keeps tooltip, Pin press hides it, Tab shows focus ring and tooltip, onCopied shown as text)
- SYS-12: keyboard inside a shadow root (browser mode: tooltips follow Tab and Escape, then menu, select, tabs, number input, switch, checkbox, hover card, toast)
- SYS-13: TruncatedText in three modes (story, truncated-text.stories.tsx Rows extended: clipped reveals, fitting does not, no tab stop proven by Tab, group reveal follows unmount and remount)
- SYS-14: VirtualJsonTree windowing and keyboard (story, virtual-json-tree.stories.tsx PageSnapshot extended)
- SYS-15: token sheet base block (node, stays in node file)
- SYS-16: token sheet skin blocks (node, stays in node file)

### packages/ui-kit-system/test/ui-kit-system.browser.test.tsx (75 tests)

| test (file:line + short title)                                                          | destination    | target (package/file or owner)                                                                            | merge-id | why (one short clause)                                                                                                     |
| --------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| 57 autosize > fitHeight > clamps to minRows                                             | node (table)   | packages/ui-kit-system/src/autosize.test.ts                                                               | SYS-1    | pure math on numbers                                                                                                       |
| 61 fitHeight > grows between the bounds                                                 | node (table)   | packages/ui-kit-system/src/autosize.test.ts                                                               | SYS-1    | one table row                                                                                                              |
| 65 fitHeight > clamps to maxRows and scrolls                                            | node (table)   | packages/ui-kit-system/src/autosize.test.ts                                                               | SYS-1    | one table row                                                                                                              |
| 69 fitHeight > content-box subtracts padding                                            | node (table)   | packages/ui-kit-system/src/autosize.test.ts                                                               | SYS-1    | one table row                                                                                                              |
| 76 measureTextArea > reports padding, border, box model                                 | story          | text-field.stories.tsx                                                                                    | SYS-3    | internal helper (not exported); prove it by a padded, bordered TextArea fitting exactly                                    |
| 82 measureTextArea > real row with line-height normal                                   | story          | text-field.stories.tsx                                                                                    | SYS-3    | needs real font metrics; the TextArea story uses line-height normal                                                        |
| 93 TextArea end to end > never clips, honours maxRows with line-height normal           | story          | text-field.stories.tsx                                                                                    | SYS-3    | re-implements the component on a raw textarea; drive the real TextArea                                                     |
| 109 TextArea end to end > fits exactly under maxRows                                    | DELETE-DUP     | text-field.stories.tsx:32 RefitsWhenWidthShrinks play (scrollHeight <= clientHeight on the real TextArea) | -        | same no-dead-space promise on the real component                                                                           |
| 168 clipboard > hands text over, status copied                                          | happy-dom      | packages/ui-kit-system/src/clipboard.dom.test.tsx                                                         | SYS-2    | DOM-free Solid hook, writer injected                                                                                       |
| 176 clipboard > falls back to idle after the window                                     | happy-dom      | packages/ui-kit-system/src/clipboard.dom.test.tsx                                                         | SYS-2    | fake timers instead of waiting 400 ms x6                                                                                   |
| 183 clipboard > refusal reports failed                                                  | happy-dom      | packages/ui-kit-system/src/clipboard.dom.test.tsx                                                         | SYS-2    | writer row "refuse"                                                                                                        |
| 189 clipboard > sync throw reports failed                                               | happy-dom      | packages/ui-kit-system/src/clipboard.dom.test.tsx                                                         | SYS-2    | writer row "throw"                                                                                                         |
| 195 clipboard > re-arms the window on a second copy                                     | happy-dom      | packages/ui-kit-system/src/clipboard.dom.test.tsx                                                         | SYS-2    | fake timers replace pause(280)/pause(240)                                                                                  |
| 206 clipboard > announces the copy in a live region                                     | DELETE-DUP     | clipboard-copy-button.stories.tsx:38 Copied play (status "Copied to clipboard")                           | -        | button announces through the same hook                                                                                     |
| 212 clipboard > announces a refusal                                                     | DELETE-DUP     | clipboard-copy-button.stories.tsx:48 CopyFailed play (status "Could not copy to clipboard")               | -        | same announcement                                                                                                          |
| 218 clipboard > button renamed Copied                                                   | DELETE-DUP     | clipboard-copy-button.stories.tsx:36-37 Copied play                                                       | -        | decision 5 pair                                                                                                            |
| 226 clipboard > tooltip stays open through the click, reads Copied                      | DELETE-DUP     | ui-kit-system.browser.test.tsx:1142 (moves to SYS-11)                                                     | -        | 1142 hovers, presses, asserts tooltip Copied                                                                               |
| 236 clipboard > button renamed Copy failed                                              | DELETE-DUP     | clipboard-copy-button.stories.tsx:46-47 CopyFailed play                                                   | -        | decision 5 pair                                                                                                            |
| 242 clipboard > button's own live region                                                | DELETE-DUP     | clipboard-copy-button.stories.tsx:38 Copied play                                                          | -        | decision 5 pair                                                                                                            |
| 248 clipboard > Tab gives a visible focus ring                                          | DELETE-DUP     | ui-kit-system.browser.test.tsx:1160 (moves to SYS-11)                                                     | -        | 1160 tabs to the same button, checks focus-visible and tooltip                                                             |
| 258 clipboard > tells the caller when a copy landed                                     | story          | clipboard-copy-button.stories.tsx (new tooltip story)                                                     | SYS-11   | onCopied shown as visible text after the press                                                                             |
| 284 anchored listbox > opens below a field near the top, every entry in view            | story          | new anchored-listbox.stories.tsx                                                                          | -        | real layout placement, one component                                                                                       |
| 329 dialog layout > footer and last row reachable on tall content                       | story          | dialog.stories.tsx LongBody (no play today)                                                               | SYS-5    | real layout and scrolling, one component                                                                                   |
| 354 dialog layout > opens fully in view from a transformed clipped row                  | story          | dialog.stories.tsx (new story)                                                                            | -        | portal out of a transformed parent, real layout                                                                            |
| 366 dialog layout > portals into another window's shadow root (iframe as PiP)           | browser mode   | packages/ui-kit-system/src/ui-kit-system.browser.test.tsx                                                 | -        | other document plus shadow root; a story cannot host it cleanly                                                            |
| 392 dialog layout > long command scrolls sideways inside the dialog                     | story          | dialog.stories.tsx LongBody                                                                               | SYS-5    | rewrite to user level: command start and dialog both in viewport, no scrollLeft writes                                     |
| 491 dialog > Escape closes a dismissable dialog                                         | story          | dialog.stories.tsx ReadyMade (no play today)                                                              | SYS-6    | one component, real keyboard                                                                                               |
| 500 dialog > click behind closes a dismissable dialog                                   | story          | dialog.stories.tsx ReadyMade                                                                              | SYS-6    | drop the bounding-rect aim; click a page button behind the layer                                                           |
| 509 dialog > still closes on a click behind when frames are starved                     | browser mode   | packages/ui-kit-system/src/ui-kit-system.browser.test.tsx                                                 | -        | real rAF timing; replace the hand rAF stub with a CPU throttle (CDP)                                                       |
| 519 dialog > non-dismissable ignores Escape and click behind                            | story          | dialog.stories.tsx (non-dismissable variant)                                                              | SYS-6    | one component                                                                                                              |
| 529 dialog > plain dialog role by default                                               | DELETE-DUP     | ui-kit-system.browser.test.tsx:549 (SYS-6)                                                                | -        | 549 finds role dialog by name                                                                                              |
| 539 dialog > alertdialog when asked                                                     | DELETE-DUP     | confirm-dialog.stories.tsx:39 Default play (findByRole alertdialog named by title)                        | -        | decision 5 pair; ConfirmDialog is Dialog with role alertdialog                                                             |
| 549 dialog > accessible name from the visible heading                                   | story          | dialog.stories.tsx ReadyMade                                                                              | SYS-6    | absorbs 529                                                                                                                |
| 560 dialog > initialFocus nominee inside a shadow root                                  | browser mode   | packages/ui-kit-system/src/ui-kit-system.browser.test.tsx                                                 | SYS-7    | real focus across a shadow boundary                                                                                        |
| 576 dialog > focus back to a light-DOM opener from a shadow root                        | browser mode   | packages/ui-kit-system/src/ui-kit-system.browser.test.tsx                                                 | SYS-7    | cross-root focus return                                                                                                    |
| 604 dialog parts > stacked dialogs in a shadow root in $mode (each x2)                  | browser mode   | packages/ui-kit-system/src/ui-kit-system.browser.test.tsx                                                 | SYS-7    | shadow root plus real keyboard and pointer; light-DOM half already in dialog.stories.tsx:201 Stacked                       |
| 711 resize > grow=$grow grows, shrinks, prevents default (loop x4)                      | happy-dom      | packages/ui-kit-system/src/resize.dom.test.tsx                                                            | SYS-8    | key math table                                                                                                             |
| 725 resize > ignores cross-axis and unrelated keys                                      | happy-dom      | packages/ui-kit-system/src/resize.dom.test.tsx                                                            | SYS-8    | table rows                                                                                                                 |
| 736 resize > clamps shrinking at min                                                    | happy-dom      | packages/ui-kit-system/src/resize.dom.test.tsx                                                            | SYS-8    | table row                                                                                                                  |
| 745 resize > persists the keyboard size for the next instance                           | happy-dom      | packages/ui-kit-system/src/resize.dom.test.tsx                                                            | SYS-8    | storage read back; unique key per run (today's fixed keys leak across runs)                                                |
| 756 resize > clamps the initial size to max                                             | happy-dom      | packages/ui-kit-system/src/resize.dom.test.tsx                                                            | SYS-8    | table row                                                                                                                  |
| 770 resize > lower max wins over min                                                    | happy-dom      | packages/ui-kit-system/src/resize.dom.test.tsx                                                            | SYS-8    | table row                                                                                                                  |
| 816 skin contrast > body ink reads on surface (test.each, under each skin x scheme)     | node (table)   | packages/ui-kit-system/src/skins.test.ts                                                                  | SYS-9    | colour math on skin data                                                                                                   |
| 823 skin contrast > faint ink reads (test.each)                                         | node (table)   | packages/ui-kit-system/src/skins.test.ts                                                                  | SYS-9    | same table                                                                                                                 |
| 830 skin contrast > status colour distinguishable (test.each)                           | node (table)   | packages/ui-kit-system/src/skins.test.ts                                                                  | SYS-9    | same table                                                                                                                 |
| 837 skin contrast > ink on accent fill reads                                            | node (table)   | packages/ui-kit-system/src/skins.test.ts                                                                  | SYS-9    | same table                                                                                                                 |
| 841 skin contrast > focus ring separates from the panel                                 | node (table)   | packages/ui-kit-system/src/skins.test.ts                                                                  | SYS-9    | same table                                                                                                                 |
| 868 TextArea autosize > fits one row on mount, reports the height                       | story          | text-field.stories.tsx                                                                                    | SYS-3    | real layout; show the reported height as text                                                                              |
| 875 TextArea autosize > grows to fit wrapped content without clipping                   | DELETE-DUP     | text-field.stories.tsx:32-35 RefitsWhenWidthShrinks play (wrapped text, scrollHeight <= clientHeight)     | -        | decision 5 pair                                                                                                            |
| 881 TextArea autosize > stops at maxRows and scrolls                                    | story          | text-field.stories.tsx                                                                                    | SYS-3    | real layout                                                                                                                |
| 889 TextArea autosize > never below minRows                                             | story          | text-field.stories.tsx                                                                                    | SYS-3    | real layout                                                                                                                |
| 896 TextArea autosize > refits both ways on width change                                | story          | text-field.stories.tsx RefitsWhenWidthShrinks                                                             | SYS-3    | story covers narrowing only; add the widen-back step                                                                       |
| 914 TextArea autosize > reports a height only when it changes                           | story          | text-field.stories.tsx                                                                                    | SYS-3    | report count as visible text                                                                                               |
| 970 tooltip icon button > keeps tooltip machine identity off the menu trigger           | DELETE-NOTHING | -                                                                                                         | -        | reads data-scope and ids; user effect proven by 983 and 995                                                                |
| 983 tooltip icon button > hides the tooltip once the menu shows                         | story          | new tooltip-icon-button.stories.tsx                                                                       | SYS-10   | one component, hover and click                                                                                             |
| 995 tooltip icon button > keyboard drives the menu without stranding the tooltip        | story          | new tooltip-icon-button.stories.tsx                                                                       | SYS-10   | real focus in Chromium story                                                                                               |
| 1012 tooltip icon button > described by the tooltip, not the wrapper                    | DELETE-DUP     | tooltip.stories.tsx:96-97 Toolbar play (aria-describedby = tooltip id, accessible description)            | -        | decision 5 pair                                                                                                            |
| 1022 tooltip icon button > pressing takes the tooltip away                              | DELETE-DUP     | ui-kit-system.browser.test.tsx:1155-1156 (Pin press hides tooltip, moves to SYS-11)                       | -        | same press                                                                                                                 |
| 1035 tooltip on a rising panel > tooltip opens outside the still-rising panel           | story          | clipboard-copy-button.stories.tsx (new rising-panel story)                                                | -        | needs the real anim-rise transform; not in the audit                                                                       |
| 1059 tooltip in a shadow root > follows Tab, closes on Escape and moving on             | browser mode   | packages/ui-kit-system/src/ui-kit-system.browser.test.tsx                                                 | SYS-12   | shadow root plus focus-visible                                                                                             |
| 1129 copy button with $mode > names the hovered button by its tooltip (each x2)         | story          | clipboard-copy-button.stories.tsx (new tooltip story)                                                     | SYS-11   | absorbs 1012's own-button half                                                                                             |
| 1142 copy button with $mode > Copied on press, tooltip stays, Pin press hides (each x2) | story          | clipboard-copy-button.stories.tsx (new tooltip story)                                                     | SYS-11   | absorbs 226, 1022                                                                                                          |
| 1160 copy button with $mode > keyboard user gets focus ring and tooltip (each x2)       | story          | clipboard-copy-button.stories.tsx (new tooltip story)                                                     | SYS-11   | absorbs 248                                                                                                                |
| 1219 truncated text with $mode > clipped text revealed in a tooltip (each x3)           | DELETE-DUP     | truncated-text.stories.tsx:32-34 Rows play (own mode) and ui-kit-system.browser.test.tsx:1252 (all modes) | -        | decision 5 pair                                                                                                            |
| 1229 truncated text with $mode > fitting text grows no tooltip (each x3)                | DELETE-DUP     | ui-kit-system.browser.test.tsx:1252                                                                       | -        | 1252 is this plus one assert                                                                                               |
| 1240 truncated text with $mode > clipped string whole for assistive tech (each x3)      | DELETE-NOTHING | -                                                                                                         | -        | reads back the string it passed in                                                                                         |
| 1246 truncated text with $mode > adds no tab stop (each x3)                             | story          | truncated-text.stories.tsx Rows                                                                           | SYS-13   | prove by Tab skipping the row, not the attribute                                                                           |
| 1252 truncated text with $mode > no dangling description on a fitting span (each x3)    | story          | truncated-text.stories.tsx Rows (three modes)                                                             | SYS-13   | real clipping detection                                                                                                    |
| 1268 shared truncated text group > reveal follows unmount and remount                   | story          | truncated-text.stories.tsx (group story with a hide/show button)                                          | SYS-13   | fix f2d65ca83 regression                                                                                                   |
| 1323 virtual json tree > only rows near the viewport in the DOM                         | story          | virtual-json-tree.stories.tsx PageSnapshot                                                                | SYS-14   | virtual list needs real sizes; drop the 40-row tuning bound for "last row absent"                                          |
| 1335 virtual json tree > top level open, deeper closed                                  | story          | virtual-json-tree.stories.tsx PageSnapshot                                                                | SYS-14   | prove by children absent, not aria-expanded                                                                                |
| 1343 virtual json tree > hundred-child branch shows its children                        | story          | virtual-json-tree.stories.tsx PageSnapshot                                                                | SYS-14   | PageSnapshot already clicks a 96-child branch open                                                                         |
| 1355 virtual json tree > End brings the last row into the window                        | story          | virtual-json-tree.stories.tsx PageSnapshot                                                                | SYS-14   | real scroll                                                                                                                |
| 1366 virtual json tree > keyboard opens and closes the focused branch                   | story          | virtual-json-tree.stories.tsx PageSnapshot                                                                | SYS-14   | real focus                                                                                                                 |
| 1495 keyboard inside a shadow root > every control reachable by keyboard alone          | browser mode   | packages/ui-kit-system/src/ui-kit-system.browser.test.tsx                                                 | SYS-12   | fix e7ddc3024; shadow-root focus; replace screenshot byte compares and activedescendant-vs-id reads with role-level checks |

Totals: node 20, story 31, browser mode 7, DELETE-DUP 15, DELETE-NOTHING 2 (75).
Becomes: the browser file shrinks to 5 tests (366 other-window portal, 509 starved frames, SYS-7 dialog focus in a shadow root as it.each x2, SYS-12 keyboard journey in a shadow root); about 20 cases move to node tables; the rest become story plays.

### packages/ui-kit-system/test/ui-kit-system.node.test.ts (7 tests)

| test (file:line + short title)                                                   | destination  | target (package/file or owner)                               | merge-id | why (one short clause)                   |
| -------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------ | -------- | ---------------------------------------- |
| 25 committed sheet > declares the %s anchor in the base block (test.each)        | node (table) | packages/ui-kit-system/src/scripts/generated-outputs.test.ts | SYS-15   | committed generated sheet stays complete |
| 29 committed sheet > declares the derived %s token in the base block (test.each) | node (table) | packages/ui-kit-system/src/scripts/generated-outputs.test.ts | SYS-15   | same slice, second list                  |
| 33 committed sheet > base block scoped to :host and :root                        | node (table) | packages/ui-kit-system/src/scripts/generated-outputs.test.ts | SYS-15   | shadow-root token scope                  |
| 39 %s skin block > matches :host(.x) and .x (inside describe.each skins)         | node (table) | packages/ui-kit-system/src/scripts/generated-outputs.test.ts | SYS-16   | skin selector shape                      |
| 43 %s skin block > lands after the base block                                    | node (table) | packages/ui-kit-system/src/scripts/generated-outputs.test.ts | SYS-16   | order wins on equal specificity          |
| 47 %s skin block > overrides the %s anchor (test.each)                           | node (table) | packages/ui-kit-system/src/scripts/generated-outputs.test.ts | SYS-16   | each skin overrides every anchor         |
| 51 %s skin block > leaves derived %s to the base block (test.each)               | node (table) | packages/ui-kit-system/src/scripts/generated-outputs.test.ts | SYS-16   | skins never redeclare derived tokens     |

Totals: node 7.
Becomes: stays as the package node file, two tables, and gains SYS-1, SYS-2, SYS-8 and SYS-9 from the browser file (about 130 lines added).

## Story plays (51 plays in 33 files)

One section per story file. "Absorbs" names the browser tests that become this play.

### packages/ui-kit-system/src/avatar.stories.tsx (2 tests)

| test                                                  | destination    | target | merge-id | why                                                                                     |
| ----------------------------------------------------- | -------------- | ------ | -------- | --------------------------------------------------------------------------------------- |
| 9 Fallback (play 16)                                  | story          | stays  | -        | fallback shows when the image is empty                                                  |
| 22 Image (play 32)                                    | DELETE-NOTHING | -      | -        | img with alt is always in the DOM; to prove a load, assert fallback "MZ" hidden instead |
| Totals: story 1, DELETE-NOTHING 1. Becomes: one play. |

### packages/ui-kit-system/src/button.stories.tsx (3 tests)

| test                                 | destination | target | merge-id | why                                 |
| ------------------------------------ | ----------- | ------ | -------- | ----------------------------------- |
| 11 Variants (play 20)                | story       | stays  | -        | every variant renders with its name |
| 56 Disabled (play 62)                | story       | stays  | -        | disabled state                      |
| 68 Clickable (play 73)               | story       | stays  | -        | click handler wiring                |
| Totals: story 3. Becomes: unchanged. |

### packages/ui-kit-system/src/checkbox.stories.tsx (2 tests)

| test                                 | destination | target | merge-id | why                                    |
| ------------------------------------ | ----------- | ------ | -------- | -------------------------------------- |
| 21 Default (play 38)                 | story       | stays  | -        | click, Space, disabled, readOnly       |
| 81 GroupKeyboard (play 83)           | story       | stays  | -        | group keyboard, error clears, readOnly |
| Totals: story 2. Becomes: unchanged. |

### packages/ui-kit-system/src/clipboard-copy-button.stories.tsx (3 tests)

| test                                                                                                                 | destination | target                                                                            | merge-id | why                           |
| -------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- | -------- | ----------------------------- |
| 24 Idle (play 26)                                                                                                    | DELETE-DUP  | clipboard-copy-button.stories.tsx:36 Copied play (clicks the button by name Copy) | -        | only asserts the Copy name    |
| 32 Copied (play 34)                                                                                                  | story       | stays                                                                             | -        | absorbs browser 206, 218, 242 |
| 42 CopyFailed (play 44)                                                                                              | story       | stays                                                                             | -        | absorbs browser 212, 236      |
| Totals: story 2, DELETE-DUP 1. Becomes: two plays plus the new SYS-11 tooltip story and the 1035 rising-panel story. |

### packages/ui-kit-system/src/collapsible.stories.tsx (2 tests)

| test                                 | destination | target | merge-id | why               |
| ------------------------------------ | ----------- | ------ | -------- | ----------------- |
| 29 Default (play 31)                 | story       | stays  | -        | click opens       |
| 40 InitiallyOpen (play 42)           | story       | stays  | -        | defaultOpen state |
| Totals: story 2. Becomes: unchanged. |

### packages/ui-kit-system/src/color-picker.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                             |
| ------------------------------------ | ----------- | ------ | -------- | ----------------------------------------------- |
| 45 Keyboard (play 47)                | story       | stays  | -        | typed commit, preset, error, readOnly, disabled |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/combobox-select.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                                  |
| ------------------------------------ | ----------- | ------ | -------- | ---------------------------------------------------- |
| 60 Keyboard (play 62)                | story       | stays  | -        | filter, empty text, late options, readOnly, disabled |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/combobox.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                     |
| ------------------------------------ | ----------- | ------ | -------- | ----------------------- |
| 50 Default (play 52)                 | story       | stays  | -        | openOnClick lists items |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/confirm-dialog.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                                                               |
| ------------------------------------ | ----------- | ------ | -------- | --------------------------------------------------------------------------------- |
| 31 Default (play 33)                 | story       | stays  | -        | alertdialog named by title, focus to Cancel, Escape, confirm; absorbs browser 539 |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/dialog.stories.tsx (2 tests)

| test                                                                                                                             | destination | target | merge-id | why                                                            |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | -------- | -------------------------------------------------------------- |
| 167 Parts (play 169)                                                                                                             | story       | stays  | -        | description, focus to Close, Escape, focus return              |
| 201 Stacked (play 203)                                                                                                           | story       | stays  | -        | top dialog blocks the one below; light-DOM half of browser 604 |
| Totals: story 2. Becomes: two plays, plus new plays on LongBody (SYS-5), ReadyMade (SYS-6) and a transformed-parent story (354). |

### packages/ui-kit-system/src/editable.stories.tsx (2 tests)

| test                                 | destination | target | merge-id | why                                   |
| ------------------------------------ | ----------- | ------ | -------- | ------------------------------------- |
| 32 Default (play 34)                 | story       | stays  | -        | rename commits, focus back to trigger |
| 46 EscapeCancels (play 48)           | story       | stays  | -        | Escape discards                       |
| Totals: story 2. Becomes: unchanged. |

### packages/ui-kit-system/src/hotkey-recorder.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                        |
| ------------------------------------ | ----------- | ------ | -------- | ------------------------------------------ |
| 46 Keyboard (play 48)                | story       | stays  | -        | record, cancel, modifiers, conflict, clear |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/hover-card.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                                           |
| ------------------------------------ | ----------- | ------ | -------- | ------------------------------------------------------------- |
| 9 Default (play 21)                  | story       | stays  | -        | hover opens; browser 1495 keeps the focus-in-shadow-root case |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/menu.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                   |
| ------------------------------------ | ----------- | ------ | -------- | --------------------- |
| 10 Default (play 30)                 | story       | stays  | -        | click selects an item |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/number-input.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                      |
| ------------------------------------ | ----------- | ------ | -------- | ---------------------------------------- |
| 58 Keyboard (play 60)                | story       | stays  | -        | arrows, PageUp, commit, errors, readOnly |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/password-input.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                                  |
| ------------------------------------ | ----------- | ------ | -------- | ---------------------------------------------------- |
| 36 Keyboard (play 38)                | story       | stays  | -        | reveal keeps focus, error clears, readOnly, disabled |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/popover.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why         |
| ------------------------------------ | ----------- | ------ | -------- | ----------- |
| 9 Default (play 23)                  | story       | stays  | -        | click opens |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/presence.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                                   |
| ------------------------------------ | ----------- | ------ | -------- | ----------------------------------------------------- |
| 10 Default (play 28)                 | story       | stays  | -        | toggles visible and hidden through the exit animation |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/radio-cards.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                                             |
| ------------------------------------ | ----------- | ------ | -------- | --------------------------------------------------------------- |
| 68 Keyboard (play 70)                | story       | stays  | -        | arrows move checked and focus, error clears, readOnly, disabled |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/relative-time.stories.tsx (2 tests)

| test                                 | destination | target | merge-id | why                                           |
| ------------------------------------ | ----------- | ------ | -------- | --------------------------------------------- |
| 11 HoursAgo (play 13)                | story       | stays  | -        | past value reads "ago"                        |
| 18 JustNow (play 20)                 | story       | stays  | -        | slightly-future value reads "now", never "in" |
| Totals: story 2. Becomes: unchanged. |

### packages/ui-kit-system/src/segment-group.stories.tsx (3 tests)

| test                                                                                                       | destination | target                                                                  | merge-id | why                                                  |
| ---------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------- | -------- | ---------------------------------------------------- |
| 18 Default (play 42)                                                                                       | DELETE-DUP  | segment-group.stories.tsx:235-236 Keyboard play (click Medium, checked) | -        | same click-selects on the same component             |
| 56 Scheme (play 83)                                                                                        | DELETE-DUP  | segment-group.stories.tsx:235-236 Keyboard play                         | -        | same click with icons added; story stays as a visual |
| 218 Keyboard (play 220)                                                                                    | story       | stays                                                                   | -        | arrows, click, error clears, readOnly, disabled      |
| Totals: story 1, DELETE-DUP 2. Becomes: one play; Default and Scheme stay as visual stories without plays. |

### packages/ui-kit-system/src/select.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                                                                             |
| ------------------------------------ | ----------- | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| 96 Keyboard (play 98)                | story       | stays  | -        | click and keyboard choose, focus kept, error clears; light-DOM half of browser 1495 select step |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/slider.stories.tsx (3 tests)

| test                                              | destination | target                                                         | merge-id | why                                            |
| ------------------------------------------------- | ----------- | -------------------------------------------------------------- | -------- | ---------------------------------------------- |
| 14 Default (play 34)                              | DELETE-DUP  | slider.stories.tsx:186-189 Keyboard play (ArrowRight 40 to 41) | -        | same key on the same parts                     |
| 43 Disabled (play 59)                             | DELETE-DUP  | slider.stories.tsx:211 Keyboard play (Balance aria-disabled)   | -        | same disabled state                            |
| 176 Keyboard (play 178)                           | story       | stays                                                          | -        | arrows, End, Home, number input sync, readOnly |
| Totals: story 1, DELETE-DUP 2. Becomes: one play. |

### packages/ui-kit-system/src/swap.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                      |
| ------------------------------------ | ----------- | ------ | -------- | ------------------------ |
| 10 Default (play 26)                 | story       | stays  | -        | swaps indicator on click |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/switch.stories.tsx (2 tests)

| test                                 | destination | target | merge-id | why                                                                                        |
| ------------------------------------ | ----------- | ------ | -------- | ------------------------------------------------------------------------------------------ |
| 12 Default (play 28)                 | story       | stays  | -        | click, drag on, short drag ignored, drag off; aims with bounding rects (needs real layout) |
| 109 Keyboard (play 111)              | story       | stays  | -        | Space, error clears, readOnly ignores drag                                                 |
| Totals: story 2. Becomes: unchanged. |

### packages/ui-kit-system/src/tabs.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                  |
| ------------------------------------ | ----------- | ------ | -------- | -------------------- |
| 9 Default (play 21)                  | story       | stays  | -        | click switches panel |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/tags-input.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                                                   |
| ------------------------------------ | ----------- | ------ | -------- | ----------------------------------------------------- |
| 45 Keyboard (play 47)                | story       | stays  | -        | Enter and comma add, Backspace removes, remove button |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/text-field.stories.tsx (3 tests)

| test                                                                     | destination | target          | merge-id | why                                                        |
| ------------------------------------------------------------------------ | ----------- | --------------- | -------- | ---------------------------------------------------------- |
| 18 RefitsWhenWidthShrinks (play 32)                                      | story       | stays, extended | SYS-3    | absorbs browser 109, 875; gains widen-back from 896        |
| 43 Autosize (play 56)                                                    | story       | stays, extended | SYS-3    | grows while typing; gains maxRows, minRows, height reports |
| 168 Keyboard (play 170)                                                  | story       | stays           | -        | errors, tab order through the copy action, counter         |
| Totals: story 3. Becomes: three plays, SYS-3 grows inside the first two. |

### packages/ui-kit-system/src/toast.stories.tsx (1 test)

| test                                 | destination | target | merge-id | why                |
| ------------------------------------ | ----------- | ------ | -------- | ------------------ |
| 10 Default (play 26)                 | story       | stays  | -        | create and dismiss |
| Totals: story 1. Becomes: unchanged. |

### packages/ui-kit-system/src/tooltip.stories.tsx (2 tests)

| test                                 | destination | target | merge-id | why                                                                      |
| ------------------------------------ | ----------- | ------ | -------- | ------------------------------------------------------------------------ |
| 19 Default (play 34)                 | story       | stays  | -        | hover opens, content ref attached                                        |
| 43 Toolbar (play 79)                 | story       | stays  | -        | group: one tooltip node, warm handoff, describedby; absorbs browser 1012 |
| Totals: story 2. Becomes: unchanged. |

### packages/ui-kit-system/src/truncated-text.stories.tsx (1 test)

| test                                                             | destination | target          | merge-id | why                                                                      |
| ---------------------------------------------------------------- | ----------- | --------------- | -------- | ------------------------------------------------------------------------ |
| 16 Rows (play 29)                                                | story       | stays, extended | SYS-13   | absorbs browser 1219; gains group modes, Tab, unmount (1246, 1252, 1268) |
| Totals: story 1. Becomes: one play extended, plus a group story. |

### packages/ui-kit-system/src/virtual-json-tree.stories.tsx (1 test)

| test                                         | destination | target          | merge-id | why                                                                |
| -------------------------------------------- | ----------- | --------------- | -------- | ------------------------------------------------------------------ |
| 49 PageSnapshot (play 51)                    | story       | stays, extended | SYS-14   | opens a 96-child branch; gains windowing, End, keyboard open/close |
| Totals: story 1. Becomes: one play extended. |

### packages/ui-kit-system/src/zoomable-image.stories.tsx (1 test)

| test                                                 | destination | target | merge-id | why                                                                                                          |
| ---------------------------------------------------- | ----------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| 12 Default (play 18)                                 | story       | stays  | -        | opens the lightbox dialog; add an assert that Escape closes it (today it presses Escape and asserts nothing) |
| Totals: story 1. Becomes: unchanged plus one assert. |

Story totals: story 45, DELETE-DUP 5, DELETE-NOTHING 1 (51).

## Cross-file duplicates (pairs, file:line <-> file:line)

Browser tests a story play already proves (decision 5; all become DELETE-DUP):

- ui-kit-system.browser.test.tsx:218 <-> clipboard-copy-button.stories.tsx:32 Copied (play 34-37)
- ui-kit-system.browser.test.tsx:242 <-> clipboard-copy-button.stories.tsx:32 Copied (play 38)
- ui-kit-system.browser.test.tsx:206 <-> clipboard-copy-button.stories.tsx:32 Copied (play 38), through the same hook
- ui-kit-system.browser.test.tsx:236 <-> clipboard-copy-button.stories.tsx:42 CopyFailed (play 44-47)
- ui-kit-system.browser.test.tsx:212 <-> clipboard-copy-button.stories.tsx:42 CopyFailed (play 48)
- ui-kit-system.browser.test.tsx:539 <-> confirm-dialog.stories.tsx:31 Default (play 39)
- ui-kit-system.browser.test.tsx:875 <-> text-field.stories.tsx:18 RefitsWhenWidthShrinks (play 32-35)
- ui-kit-system.browser.test.tsx:109 <-> text-field.stories.tsx:18 RefitsWhenWidthShrinks (play 32-35)
- ui-kit-system.browser.test.tsx:1012 <-> tooltip.stories.tsx:43 Toolbar (play 96-97)
- ui-kit-system.browser.test.tsx:1219 <-> truncated-text.stories.tsx:16 Rows (play 32-34)

Partial overlaps (kept, named so the rewrite does not double them):

- ui-kit-system.browser.test.tsx:604 (shadow root, both modes) <-> dialog.stories.tsx:201 Stacked (light DOM)
- ui-kit-system.browser.test.tsx:1343 <-> virtual-json-tree.stories.tsx:49 PageSnapshot (same open-a-big-branch click)
- ui-kit-system.browser.test.tsx:896 <-> text-field.stories.tsx:18 RefitsWhenWidthShrinks (narrowing only)
- ui-kit-system.browser.test.tsx:1495 select, menu, tabs, switch, hover card, toast steps <-> select.stories.tsx:96, menu.stories.tsx:10, tabs.stories.tsx:9, switch.stories.tsx:109, hover-card.stories.tsx:9, toast.stories.tsx:10 (light DOM; 1495 owns the shadow-root focus case only)

Inside the browser file: 226 = 1142; 248 = 1160; 1022 = 1142 (1155-1156); 529 = 549; 1229 = 1252; 93 re-implements what 881 drives.

Inside story files: clipboard-copy-button Idle = Copied first step; segment-group Default and Scheme = Keyboard click step; slider Default and Disabled = Keyboard steps.

Consumers in other packages that re-assert these kit contracts (from the audit at 51708bc06, lines not re-checked at this head; this package is the owner, the consumer copies are what to drop): ui-kit-chat composer.browser 493/507 and cards.browser 801 (TruncatedText), thread.browser 1099 and composer.browser 112/241 (clipboard copy), apps/conciv conciv.browser 7043 (ClipboardCopyButton Copied tooltip), conciv.browser 10327 (stacked plugin dialogs).

## Plugin-owned tests (tests that a plugin should own, if any)

None. Every test here proves a kit primitive (dialog, tooltip, clipboard, autosize, resize, skins, JSON tree) that no single plugin owns.

## Cannot move to happy-dom (looks like it could, but needs X) and suspected happy-dom blockers

Nothing in this package is sent to happy-dom happy-dom; these are the reasons, so nobody tries:

- TextArea autosize (76, 82, 93, 868-914, story plays): needs real scrollHeight/clientHeight and real font metrics for line-height normal; happy-dom returns 0 for both.
- TruncatedText (1219-1268, Rows play): clipping is detected from real overflow (scrollWidth > clientWidth); happy-dom never clips, so nothing would ever reveal.
- VirtualJsonTree (1323-1366, PageSnapshot): @tanstack/virtual needs real element sizes and scrolling; under happy-dom it renders zero or all rows.
- Anchored listbox placement (284), dialog layout (329, 354, 392): floating-ui positioning and toBeInViewport need real layout.
- Tooltip rising panel (1035): depends on the anim-rise CSS transform making a containing block; happy-dom runs no CSS animation.
- Focus-visible cases (1059, 1160, 1366, 1495, 995): `:focus-visible` heuristics and Tab order across shadow roots are real-browser only; Ark/zag listbox and menu highlight is gated on DOM focus (AGENTS.md landmine), which happy-dom does not model the same way.
- Shadow-root dialog focus (560, 576, 604) and other-window portal (366): real focus delegation through a shadow host and an iframe document.
- Starved frames (509): real requestAnimationFrame scheduling; the rewrite should throttle the CPU through CDP instead of the hand rAF replacement.
- Switch drag plays (switch.stories.tsx:28, :111): pointer coordinates from real bounding rects; Presence play: hidden state follows the exit animation end.

Node-file moves that look trivial but need setup:

- SYS-2 (createClipboardCopy) and SYS-8 (createResizable): the node project has no solid plugin, so `solid-js` resolves to its server build, where createEffect never runs and memos do not update. The node project needs the solid browser/dev resolution (vite-plugin-solid with environment pinned to node) or these stay reactive-dead. SYS-8 also uses `KeyboardEvent` (not a Node global) and storage (Node localStorage needs a backing file); a happy-dom environment for that describe, or plain `{key, preventDefault}` event objects plus a real storage, is needed. SYS-2 uses fake timers for the copied window.
- SYS-9 needs only `test/wcag.ts` and skin data: truly pure, no blocker.

---

# Part: small kits

### packages/ui-kit-tap/test/ui-kit-tap.test.ts (1 test)

| test                                                                                   | destination | target                                              | merge-id | why                                                    |
| -------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------- | -------- | ------------------------------------------------------ |
| :22 peer provision > %s declares no peer this package leaves unresolved (each xK deps) | node        | packages/ui-kit-tap/src/index.test.ts (Decision K2) | -        | install guard over real node_modules manifests, no DOM |

Totals: node 1. File stays as is (29 lines).

### packages/ui-kit-tap/test/ui-kit-tap.browser.test.tsx (6 tests)

| test                                                                                          | destination | target                                                                | merge-id | why                                                                                             |
| --------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| :82 external value > keeps the caret in place when an external write changes text after it    | story       | rich-text-field.stories.tsx, new play ExternalWrites                  | TAP-1    | one component, caret mapping; needs real contenteditable selection, which Storybook already has |
| :96 maps the caret through an external write that changes text before it                      | story       | rich-text-field.stories.tsx ExternalWrites                            | TAP-1    | second external write in the same play                                                          |
| :110 restores a draft into an empty field with the caret at the end                           | story       | rich-text-field.stories.tsx ExternalWrites                            | TAP-1    | third external write in the same play                                                           |
| :120 flattens a chip the external write spans into plain text                                 | DELETE-DUP  | rich-text-field-triggers.stories.tsx:480 ExternalReplaceFlattensChips | -        | the play inserts /clear, writes '@ai:opus' and sees plain text                                  |
| :130 leaves an externally written value alone when the user undoes                            | DELETE-DUP  | rich-text-field-triggers.stories.tsx:480 ExternalReplaceFlattensChips | -        | same steps: chip, external '@ai:opus', focus end, undo, backspace gives '@ai:opu'               |
| :155 trigger item insert > lists the row by its label and inserts its insert text as the chip | story       | rich-text-field-triggers.stories.tsx, into MentionArrowSelect         | TAP-2    | add one item with `insert` to the harness PEOPLE list                                           |

TAP-1 journey: "external writes keep the caret where the user expects": write after the caret, write before it, fill an empty field.
Totals: story 4, DELETE-DUP 2. File is deleted (its last behaviours move into the two story files; ui-kit-tap keeps only its node file).

### packages/ui-kit-tap/src/rich-text-field.stories.tsx (11 plays)

| test                               | destination | target                                              | merge-id | why                                                                                                        |
| ---------------------------------- | ----------- | --------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| :68 Empty                          | story       | stays                                               | -        | placeholder state                                                                                          |
| :77 TypingAndSubmit                | story       | stays                                               | -        | type, selection, Enter submits and clears                                                                  |
| :93 ShiftEnterMultiline            | story       | stays                                               | -        | Shift+Enter line break                                                                                     |
| :107 Disabled                      | story       | stays                                               | -        | disabled state ignores input                                                                               |
| :122 PasteLowersToPlainText        | story       | stays                                               | -        | paste lowers html to text; needs real clipboard events                                                     |
| :137 PasteFilesConsumedByHook      | story       | stays                                               | -        | file paste goes to the hook                                                                                |
| :151 UndoRedoTyping                | story       | stays                                               | -        | undo/redo of typing                                                                                        |
| :166 ExternalReplacementResetsUndo | story       | merge with rich-text-field-triggers.stories.tsx:480 | TAP-3    | same rule (undo never reverts an external write); 480 adds the chip                                        |
| :184 HandleInsertAppendClear       | story       | stays                                               | -        | handle API; carries a 600 ms sleep (settleHistoryGroup) to replace                                         |
| :206 CompositionGuardedSubmit      | story       | stays                                               | -        | IME composition never submits                                                                              |
| :224 CapAndInternalScroll          | story       | stays, rewrite                                      | -        | title promises a height cap and scroll but asserts only text; assert the last line is visible after typing |

Totals: story 11 (1 merged). File grows by the TAP-1 play.

### packages/ui-kit-tap/src/rich-text-field-triggers.stories.tsx (34 plays)

| test                                                       | destination    | target                                                                          | merge-id | why                                                                                                                            |
| ---------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| :266 SlashSelectInsertsChipAndSpace                        | story          | stays                                                                           | -        | slash filter, Enter inserts chip plus space                                                                                    |
| :284 GroupHeadersAndDescriptions                           | story          | stays                                                                           | -        | groups and descriptions by role                                                                                                |
| :298 MentionArrowSelect                                    | story          | stays, absorbs ui-kit-tap.browser:155                                           | TAP-2    | mention select by keyboard                                                                                                     |
| :310 ArrowNavigationWraps                                  | DELETE-DUP     | rich-text-field-triggers.stories.tsx:747 LongSuggestionListWrapsFromLastToFirst | -        | 747 proves the same wrap up and back down                                                                                      |
| :322 PointerSelectionInsertsChip                           | story          | stays                                                                           | -        | click option, focus returns                                                                                                    |
| :336 CategoriesDrillAndBack                                | story          | merge                                                                           | TAP-10   | categories journey                                                                                                             |
| :355 CategoryKeyboardDrillAndBackspaceReturns              | story          | merge                                                                           | TAP-10   | categories journey                                                                                                             |
| :373 BackAffordanceSurvivesAQueryInsideACategory           | story          | merge                                                                           | TAP-10   | categories journey                                                                                                             |
| :391 TypedQueryAtRootSearchesFlat                          | story          | merge                                                                           | TAP-10   | categories journey                                                                                                             |
| :402 ChipAtomicBackspace                                   | DELETE-DUP     | rich-text-field-triggers.stories.tsx:463 UndoRestoresDeletedChip                | -        | 463 runs the same two backspaces before its undo                                                                               |
| :414 ChipAtomicForwardDelete                               | story          | stays                                                                           | -        | forward delete removes the chip whole                                                                                          |
| :429 RangeCutAcrossChips                                   | story          | stays                                                                           | -        | range delete across a chip                                                                                                     |
| :445 UndoRedoChipInsert                                    | story          | stays                                                                           | -        | undo/redo of a chip insert                                                                                                     |
| :463 UndoRestoresDeletedChip                               | story          | stays                                                                           | -        | undo brings the chip back                                                                                                      |
| :480 ExternalReplaceFlattensChips                          | story          | stays, absorbs ui-kit-tap.browser:120, :130 and rich-text-field.stories:166     | TAP-3    | external write flattens chips and is not undone                                                                                |
| :497 InsertTextPreservesChips                              | story          | stays                                                                           | -        | handle insert keeps chips; 600 ms sleep to replace                                                                             |
| :513 EscapeDismissKeepsTypedText                           | story          | merge                                                                           | TAP-11   | dismiss journey                                                                                                                |
| :531 DismissedMenuReleasesTheKeyboard                      | story          | merge                                                                           | TAP-11   | dismiss journey                                                                                                                |
| :546 AsyncLoadingThenReady                                 | story          | stays                                                                           | -        | loading then options; uses a real 400 ms delay, switch to manual mode                                                          |
| :557 AsyncEmpty                                            | story          | merge                                                                           | TAP-7    | empty list journey                                                                                                             |
| :569 EmptyListSwallowsNothingButStaysOpen                  | story          | merge                                                                           | TAP-7    | empty list journey                                                                                                             |
| :588 AsyncError                                            | story          | stays                                                                           | -        | source error message                                                                                                           |
| :598 StaleResultAfterCloseDiscarded                        | story          | merge                                                                           | TAP-8    | stale results journey                                                                                                          |
| :613 StaleResultAfterQueryMovesDiscarded                   | story          | merge                                                                           | TAP-8    | stale results journey                                                                                                          |
| :631 LoadingKeepsCarriedItemsInert                         | story          | merge                                                                           | TAP-9    | loading with carried items journey                                                                                             |
| :660 LoadingKeepsTheHighlightOnCarriedItems                | story          | merge                                                                           | TAP-9    | loading with carried items journey                                                                                             |
| :680 EnterDuringInitialLoadingDoesNotSubmit                | story          | merge                                                                           | TAP-9    | Enter while loading                                                                                                            |
| :697 ShiftEnterBreaksLineWhileTypeaheadIsOpen              | story          | stays                                                                           | -        | Shift+Enter with menu open                                                                                                     |
| :710 ActiveOptionScrollsIntoView                           | story          | merge into :730                                                                 | TAP-6    | same scroll-into-view rule; keep its Enter commit step                                                                         |
| :730 LongSuggestionListKeepsHighlightVisibleWhileScrolling | story          | stays                                                                           | TAP-6    | needs real layout (scrollIntoView, visibility)                                                                                 |
| :747 LongSuggestionListWrapsFromLastToFirst                | story          | stays                                                                           | -        | wrap plus visibility; needs real layout                                                                                        |
| :762 ManualModeCollapsesStalePendingBehindASummary         | DELETE-NOTHING | -                                                                               | -        | proves the story harness's own "N earlier pending requests" button, not the component; per-keystroke fetches are shown by :613 |
| :782 ScreenReaderSurface                                   | story          | stays                                                                           | -        | combobox aria wiring                                                                                                           |
| :798 TrailingSpaceNotDuplicated                            | story          | stays                                                                           | -        | chip before existing text keeps one space; uses Selection.modify (real browser)                                                |

Journeys: TAP-7 "nothing matches: list stays open, swallows nothing, Escape closes"; TAP-8 "a late result for a closed menu or an old query is dropped"; TAP-9 "while a query loads, carried items stay visible, keep the highlight and Enter does nothing"; TAP-10 "categories: drill in by click and keyboard, back by button and Backspace, query inside a category, flat search at root"; TAP-11 "Escape closes the menu and gives the keys back to the field".
Totals: story 31 (into about 22 plays after merges), DELETE-DUP 2, DELETE-NOTHING 1.

### packages/ui-kit-tap/src/mention-field.stories.tsx (7 plays)

| test                                         | destination | target         | merge-id | why                                                                        |
| -------------------------------------------- | ----------- | -------------- | -------- | -------------------------------------------------------------------------- |
| :31 Empty                                    | story       | stays          | -        | placeholder state                                                          |
| :40 MentionOptionsCarryAvatars               | story       | stays          | -        | avatars in options                                                         |
| :53 MentionScreenReaderSurface               | story       | stays          | -        | combobox aria; MentionField is a separate tiptap editor, not RichTextField |
| :78 MentionTabCommitsTheHighlightedOption    | story       | merge          | TAP-4    | commit journey                                                             |
| :100 MentionCancelledClickKeepsEditorFocused | story       | stays          | -        | cancelled pointer press keeps focus; needs real focus                      |
| :114 MentionEnterSubmitsWhenNothingMatches   | story       | stays          | -        | Enter with no match submits text                                           |
| :129 MentionFlow                             | story       | merge with :78 | TAP-4    | same 'hi @Op' and same sent segments; one commits by Tab, one by click     |

TAP-4 journey: "commit a mention by Tab, then by click, and submit the segments".
Totals: story 7 (6 plays after merge).

### packages/ui-kit-terminal/test/terminal.test.tsx (19 tests)

| test                                                                                           | destination    | target                                                                                                                                     | merge-id | why                                                                                                             |
| ---------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| :112 terminal primitives > mounts xterm and renders written bytes                              | DELETE-COVERED | the `@conciv/plugin-terminal` journey (plugins area; at 9d4f4834f the conciv.browser terminal test and the embed.it Terminal tab, echo 42) | -        | written bytes rendering proven through the real socket upstream                                                 |
| :129 inject is a safe no-op while disconnected (gone by 9d4f4834f)                             | not carried    | -                                                                                                                                          | -        | tests API deleted as dead code in 0bc80ef1b (`inject`, `TerminalPrimitive.Overlay`, the styled Terminal `rail`) |
| :128 paste routes through terminal input                                                       | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-1    | xterm onData path that grab uses                                                                                |
| :153 rail overlay sits beside the screen, not over it (gone by 9d4f4834f)                      | not carried    | -                                                                                                                                          | -        | tests API deleted as dead code in 0bc80ef1b (`inject`, `TerminalPrimitive.Overlay`, the styled Terminal `rail`) |
| :178 top-right overlay pins to the root corner above the screen (gone by 9d4f4834f)            | not carried    | -                                                                                                                                          | -        | tests API deleted as dead code in 0bc80ef1b (`inject`, `TerminalPrimitive.Overlay`, the styled Terminal `rail`) |
| :146 injects xterm css into the shadow root even when mounted detached                         | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | -        | real shadow DOM plus xterm; reads a style tag (rule break): rewrite to "the screen shows text once attached"    |
| :171 a screen that gets its size after mounting fits without a resize observer loop            | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | -        | real ResizeObserver and layout                                                                                  |
| :201 a screen in a container that shrinks to fit keeps its width across fits                   | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | -        | real layout for xterm fit; uses rAF loop                                                                        |
| :229 shows the banner only after exit                                                          | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-3    | control-frame table: exit                                                                                       |
| :246 surfaces error frames as error status                                                     | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-3    | control-frame table: error                                                                                      |
| :263 keeps the failure a session reports before it says it opened                              | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-3    | control-frame table: error before open                                                                          |
| :284 tracks busy frames                                                                        | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-3    | control-frame table: busy                                                                                       |
| :299 terminal reconnection > reopens the session after the connection drops                    | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-4    | reconnect journey over the control WS server                                                                    |
| :313 keeps reopening past the per-episode attempt cap when every drop recovers                 | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-4    | same journey, more drops; drop the 3 s inline timeout                                                           |
| :329 never reopens the session after a deliberate disconnect                                   | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-4    | same journey end                                                                                                |
| :368 a connection dropped while the screen holds one row reopens once the screen is tall again | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-5    | xterm fit from real heights                                                                                     |
| :400 a screen wider than the engine takes opens at the widest size it takes                    | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | TRM-5    | 6000 px real layout                                                                                             |
| :474 terminal rail > builds the rail overlay exactly once (gone by 9d4f4834f)                  | not carried    | -                                                                                                                                          | -        | tests API deleted as dead code in 0bc80ef1b (`inject`, `TerminalPrimitive.Overlay`, the styled Terminal `rail`) |
| :419 terminal screen inset > wraps lines at the columns that fit inside the screen padding     | browser mode   | packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx                                                                              | -        | real padding and fit                                                                                            |

Reason for browser mode throughout: xterm (canvas renderer, fit from real sizes). All rows now cite `9d4f4834f` lines (they cited 86d94e743 before). Journeys: TRM-1 "paste reaches the terminal input" (inject is gone); TRM-2 is gone (the overlay and rail were deleted as dead code in 0bc80ef1b); TRM-3 "control frames (exit, error, error-before-open, busy) show as banner and status", an it.each table; TRM-4 "drops reconnect, past the cap, never after a deliberate disconnect": the test's own control WebSocket server closes the socket, a real server close and no kit fault (Decision K4); TRM-5 "the engine's size limits".
Totals: browser mode 14, DELETE-COVERED 1, not carried 4 = 19. File becomes: `packages/ui-kit-terminal/src/ui-kit-terminal.browser.test.tsx`, about 8 tests (4 journeys plus 4 single layout tests), the package's one browser file.

### packages/solid-diffs/test/solid-diffs.test.ts (4 tests)

| test                                                                                                               | destination    | target                                                                       | merge-id | why                                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| :16 build externals > externalizes @tanstack/solid-pacer                                                           | node (table)   | packages/solid-diffs/src/index.test.ts (Decision K3) it.each over specifiers | DIF-1    | reads dist text, a table of two specifiers                                               |
| :20 externalizes solid-js                                                                                          | node           | packages/solid-diffs/src/index.test.ts (Decision K3)                         | DIF-1    | second row                                                                               |
| :50 render sync > a stream of content updates renders fewer times than it updates and settles on the final content | node           | packages/solid-diffs/src/render-sync.test.ts                                 | -        | syncRender pacing; switch to fake timers (12 real 10 ms sleeps plus a 2 s waitFor today) |
| :87 stale highlight result > a highlight for a superseded file never replaces the current render                   | DELETE-NOTHING | -                                                                            | -        | calls only @pierre/diffs (FileRenderer, onHighlightSuccess); no conciv code on the path  |

Totals: node 3, DELETE-NOTHING 1. File shrinks to 2 tests.

### packages/solid-diffs/src/code-block.stories.tsx (1 play)

| test           | destination | target | merge-id | why                                                                                                              |
| -------------- | ----------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| :16 TypeScript | story       | stays  | -        | code renders; reads the diffs-container shadow root by tag (rule break, keep until the component exposes a role) |

### packages/solid-diffs/src/file-diff.stories.tsx (2 plays)

| test           | destination | target         | merge-id | why                                                                             |
| -------------- | ----------- | -------------- | -------- | ------------------------------------------------------------------------------- |
| :14 TypeScript | story       | stays          | DIF-2    | diff shows both sides                                                           |
| :28 CssEdit    | story       | merge with :14 | DIF-2    | second language of the same rule; one play or keep as visual state with no play |

Totals: story 3.

### packages/solid-streamdown/test/solid-streamdown.browser.test.tsx (10 tests)

| test                                                                                                            | destination | target                                                  | merge-id | why                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| :57 highlighted fence stability > renders the token elements a highlight hook returns for a fence               | story       | streamdown.stories.tsx, new play HighlightedFence       | SD-1     | one component state                                                                                                        |
| :68 keeps the same token nodes when the hook re-runs with equal tokens                                          | story       | streamdown.stories.tsx HighlightedFence                 | SD-1     | node identity via MutationObserver; decision 6: rewrite as "a selection over a token survives a re-highlight"              |
| :89 mounts only the new tokens while a highlighted fence grows during streaming                                 | story       | streamdown.stories.tsx HighlightedFence                 | SD-1     | same rewrite while streaming                                                                                               |
| :119 settled words > drops word spans once streaming stops                                                      | story       | streamdown.stories.tsx Streaming                        | SD-2     | decision 6: rewrite as "copied text after settle is the plain reply" or delete                                             |
| :154 streamed text stability > keeps already rendered word spans and text nodes in place as later chunks arrive | story       | streamdown.stories.tsx Streaming                        | SD-2     | decision 6: rewrite as "a selection in streamed text survives the next chunk"                                              |
| :199 local file links > hands links and existing paths to the host...                                           | story       | streamdown.stories.tsx:361 LocalFileLinks, absorbs      | SD-3     | the play is a one-click subset of this test; move the full steps (keyboard Enter/Space/Tab needs real focus) into the play |
| :268 asks about the paths of the block still streaming only once streaming ends                                 | story       | streamdown.stories.tsx LocalFileLinks or a sibling play | SD-3     | same feature while streaming                                                                                               |
| :346 fence view fallback > shows the code once a view falls back or throws...                                   | story       | streamdown.stories.tsx:394 FenceFallback, absorbs       | SD-4     | the play is a subset (decline and throw); add new-code remount, claimed fallback, nested view                              |
| :402 structural streaming > does not crash while structure-changing markdown streams                            | story       | streamdown.stories.tsx, new play StructuralStreaming    | SD-5     | crash guard; one corpus                                                                                                    |
| :421 does not crash while paragraphs, lists, and a blockquote merge and split                                   | story       | same play                                               | SD-5     | second corpus, it.each style loop                                                                                          |

Totals: story 10. File is deleted; everything lands in streamdown.stories.tsx.

### packages/solid-streamdown/src/streamdown.stories.tsx (9 plays)

| test                    | destination    | target                            | merge-id | why                                                                                                      |
| ----------------------- | -------------- | --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| :123 Static             | story          | stays, rewrite                    | -        | queries `table` and `.sd-demo-code` by tag/class (rule break): use role table and text                   |
| :139 Streaming          | story          | stays                             | SD-2     | streams to the end; reads `[data-sd-animate]` (rule break); 15 s inline timeouts to drop                 |
| :252 CaretCircle        | DELETE-NOTHING | -                                 | -        | asserts only that text arrives, which :139 already proves; keep the story as a visual state without play |
| :261 NoAnimation        | story          | stays                             | -        | no animation markers; reads `[data-sd-animate]` (rule break)                                             |
| :286 IncompleteMarkdown | story          | stays, rewrite                    | -        | healing; class selectors `.sd-healed strong` to replace with role/text                                   |
| :301 RawHtml            | story          | stays                             | -        | kbd kept, script dropped; tag selectors                                                                  |
| :316 LinkSafety         | story          | stays                             | -        | unsafe protocols stripped; reads href (keep, security)                                                   |
| :363 LocalFileLinks     | story          | stays, absorbs test :199 and :268 | SD-3     | host link handling                                                                                       |
| :400 FenceFallback      | story          | stays, absorbs test :346          | SD-4     | fence view fallback                                                                                      |

Totals: story 8, DELETE-NOTHING 1.

### packages/brand/test/browser/solid-lockup.browser.test.tsx (4 tests)

| test                                                                       | destination    | target                                                     | merge-id | why                                                                                       |
| -------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| :19 wakes the blink when the link takes real keyboard focus                | story          | packages/brand/src/motion.stories.tsx HoverToWake, absorbs | BR-1     | real :focus-visible, which Storybook's Chromium has                                       |
| :33 stops the blink and settles the cursor solid on pointer leave          | story          | motion.stories.tsx                                         | BR-1     | same journey; SETTLE_WINDOW_MS sleep to replace with fake timers or a reduced window      |
| :46 stops the blink and settles the cursor solid on blur                   | story          | motion.stories.tsx                                         | BR-1     | same journey                                                                              |
| :59 stops every handle on unmount instead of mutating attributes afterward | DELETE-NOTHING | -                                                          | -        | nothing a user can see after unmount (decision 6); reads SVG attributes on detached nodes |

BR-1 journey: "the lockup wakes on keyboard focus and hover, settles solid on leave and blur". All read the SVG cursor's opacity attribute (a DOM read); no visible role exists for the cursor, so this needs a sanctioned exception like the mascot or an accessible state.
Totals: story 3, DELETE-NOTHING 1. File is deleted (plus its helper lockup-dom.js if brand-react no longer shares it).

### packages/brand-react/test/browser/react-lockup.browser.test.tsx (4 tests)

| test                                                                       | destination    | target                                                | merge-id | why                                                                            |
| -------------------------------------------------------------------------- | -------------- | ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| :37 wakes the blink when the link takes real keyboard focus                | browser mode   | packages/brand-react/src/brand-react.browser.test.tsx | BR-2     | React component, the Solid Storybook cannot host it; needs real :focus-visible |
| :51 stops the blink and settles the cursor solid on pointer leave          | browser mode   | packages/brand-react/src/brand-react.browser.test.tsx | BR-2     | same journey                                                                   |
| :64 stops the blink and settles the cursor solid on blur                   | browser mode   | packages/brand-react/src/brand-react.browser.test.tsx | BR-2     | same journey                                                                   |
| :77 stops every handle on unmount instead of mutating attributes afterward | DELETE-NOTHING | -                                                     | -        | nothing visible after unmount (decision 6)                                     |

Totals: browser mode 3 (one journey), DELETE-NOTHING 1. File shrinks to one test. It is a near copy of the Solid file over a different implementation, so it is not a duplicate.

### packages/brand/src/motion.stories.tsx (1 play)

| test           | destination | target                            | merge-id | why                                                                           |
| -------------- | ----------- | --------------------------------- | -------- | ----------------------------------------------------------------------------- |
| :9 HoverToWake | story       | stays, absorbs solid-lockup tests | BR-1     | today it hovers and asserts nothing after; the absorbed steps give it asserts |

### apps/storybook/src/mascot/mascot-gallery.stories.tsx (3 plays)

(The 9 the first count found included `display:` style lines; the file has 3 plays.)

| test            | destination | target         | merge-id | why                                                                                          |
| --------------- | ----------- | -------------- | -------- | -------------------------------------------------------------------------------------------- |
| :458 Playground | story       | stays          | -        | robot img by name and effect subpath text                                                    |
| :479 Compound   | story       | stays, rewrite | -        | counts `[data-scope][data-part]` nodes (rule break): assert the img name and usage text only |
| :493 Index      | story       | stays          | -        | every part, effect and wrapper listed                                                        |

Totals: story 3.

## Cross-file duplicates (small kits)

- ui-kit-tap.browser.test.tsx:120 and :130 <-> rich-text-field-triggers.stories.tsx:480 ExternalReplaceFlattensChips (same steps, same values).
- rich-text-field.stories.tsx:166 ExternalReplacementResetsUndo <-> rich-text-field-triggers.stories.tsx:480 (undo never reverts an external write).
- rich-text-field-triggers.stories.tsx:310 <-> :747 (wrap), :402 <-> :463 (atomic backspace), :710 <-> :730 (scroll into view).
- mention-field.stories.tsx:78 <-> :129 (same mention commit and sent segments).
- solid-streamdown.browser.test.tsx:199 <-> streamdown.stories.tsx:361 LocalFileLinks (play is a subset).
- solid-streamdown.browser.test.tsx:346 <-> streamdown.stories.tsx:394 FenceFallback (play is a subset).
- streamdown.stories.tsx:252 CaretCircle <-> :139 Streaming (same assert).
- solid-lockup.browser.test.tsx:19-57 <-> motion.stories.tsx:9 HoverToWake (play hovers without an assert).
- Browser tests a play already duplicates, to delete in wave 4: ui-kit-tap.browser:120, :130. The streamdown and brand tests are not deleted but absorbed into the plays that cover a subset of them.

## Plugin-owned tests (small kits)

None. terminal.test.tsx:113 is covered by the terminal plugin journey (written bytes through the real PTY); the kit keeps only xterm layout and model wiring.

## Cannot move to happy-dom, and suspected blockers (small kits)

- ui-kit-tap (all): tiptap/ProseMirror contenteditable needs real selection, beforeinput, Selection.modify, clipboard DataTransfer and composition events; happy-dom has no reliable Selection/Range layout. Storybook (real Chromium) is the right home; none of it should go to happy-dom.
- Trigger menu scroll plays (:710, :730, :747) need scrollIntoView and real visibility.
- mention-field :100 needs real focus after a cancelled pointer press.
- ui-kit-terminal (all): xterm renders to canvas and fits from real element sizes; ResizeObserver loop test needs real ResizeObserver. Model-only tests (:129, :318, :339) could run without a screen, but createTerminalModel builds an xterm Terminal, which is unverified under happy-dom; keep in the browser file.
- solid-streamdown: the decision 6 rewrites (selection survives a chunk) need real Selection; keyboard steps in :199 need real focus order.
- brand / brand-react: :focus-visible only matches with real keyboard modality.
- Rule breaks to fix in the move: 600 ms sleeps (settleHistoryGroup) in both tap story files, real 400 ms delay in AsyncLoadingThenReady, 15 s inline timeouts in streamdown plays, SETTLE_WINDOW_MS sleeps in both lockup files, class/tag/data-attribute selectors in streamdown plays, the mascot Compound play and the terminal shadow-root test.

## Decisions

Each one lists my pick first. No new kit API is needed.

- **K1. ui-kit-system clipboard and resize** (`createClipboardCopy`, `createResizable`; ui-kit-system.browser rows
  1224-1228 and 1252-1257). A node project resolves `solid-js` to its server build, where effects never run. The resize
  test also builds a `KeyboardEvent` and persists through `localStorage`.
  - Pick: happy-dom, `src/clipboard.dom.test.tsx` and `src/resize.dom.test.tsx`, with the solid plugin the happy-dom
    project already has.
  - Or: node, which needs the solid browser resolution in the node project.
- **K2. The ui-kit-tap peer guard** (ui-kit-tap.test.ts:22) reads `package.json` and the installed manifests. It has no
  module to sit beside.
  - Pick: `packages/ui-kit-tap/src/index.test.ts`, beside the package entry.
  - Or: a repo check script in `@conciv/publish` instead of a test.
- **K3. The solid-diffs build-externals test** (solid-diffs.test.ts:16, :20) reads `dist/index.js`.
  - Pick: `packages/solid-diffs/src/index.test.ts`, beside the entry; `turbo run test` builds first.
  - Or: fold it into the repo's existing externals checks.
- **K4. The terminal reconnect journey** (TRM-4). The test's own control WebSocket server closes the socket.
  - Pick: keep it in browser mode. A real server close is not a kit fault and needs no kit API.
  - Or: not carried, if the maintainer counts any dropped connection as a ruled-out fault.
- **K5. Storybook `fn` spies.** They are in composer.stories:107, 121, 206, 207 and 263, queue-item.stories:64 and
  action-row AllowDeny.
  - Pick: each becomes a visible log the story renders, which the play reads by text (rule 2).
  - Or: allow `fn` from `storybook/test` in stories only.
- **K6. Reduced motion for the now-line spinner** (thread:362). The old test stubbed `window.matchMedia`.
  - Pick: the browser-mode file of ui-kit-chat renders the now line with the real reduced-motion media query. That is
    the carried ruling's "one browser-mode check of the real media query".
  - Or: a story, if the story runner can emulate the media query.
- **K7. What a kit package's browser-mode file uses.** The rulings name `createEngine` + `mount` for browser mode, but a
  kit component needs no engine.
  - Pick: kit browser files render the component directly with `@solidjs/testing-library`, with no engine and no
    `mount`.
  - Or: kit layout checks move into stories, and the four kit browser files go.
- **K8. Skin contrast** (ui-kit-system.browser 816-830). The contrast maths came from the deleted helper `test/wcag.js`,
  and no source module has it.
  - Pick: a local function in `src/skins.test.ts`.
  - Or: a `contrastRatio` source module, which is new product code kept alive by a test, so no.
