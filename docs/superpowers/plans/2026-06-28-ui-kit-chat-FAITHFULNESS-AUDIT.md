# ui-kit-chat ↔ assistant-ui faithfulness audit

Compared every headless primitive family against `assistant-ui/packages/react/src/primitives/*`
(@ 523e0b563) and the API spec. ✅ = faithful, ⚠️ = present but behaviorally thin, ❌ = missing.

## A. Headless primitive PARTS (family by family)

| Family             | assistant-ui parts                                                                                                     | Mine                                                                      | Status                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| actionBar          | Copy, Edit, ExportMarkdown, Feedback±, Reload, Root, Speak, StopSpeaking, +useActionBarFloatStatus                     | all parts ✅, float-status ⚠️                                             | ⚠️ Root autohide is basic; `data-floating` set but no not-last+hover reserve-space math |
| actionBarMore      | Content/Item/Root/Separator/Trigger                                                                                    | all ✅                                                                    | ✅                                                                                      |
| assistantModal     | Anchor/Content/Root/Trigger                                                                                            | all ✅                                                                    | ⚠️ `openOnRunStart` accepted but not wired (no auto-open on run)                        |
| attachment         | Name/Remove/Root/Thumb                                                                                                 | all ✅                                                                    | ✅ (assistant-ui's are equally thin)                                                    |
| branchPicker       | Count/Next/Number/Previous/Root                                                                                        | all ✅                                                                    | ✅ inert by design                                                                      |
| chainOfThought     | AccordionTrigger/Parts/Root                                                                                            | all ✅                                                                    | ✅                                                                                      |
| composer           | AddAttachment/Dropzone/Attachments/Cancel/Dictate/DictationTranscript/If/Input/**Queue**/Quote/Root/Send/StopDictation | missing **Queue**; Input missing focus/paste props                        | ❌→fixing                                                                               |
| error              | Message/Root                                                                                                           | all ✅                                                                    | ✅                                                                                      |
| message            | Attachments/Error/If/Parts/**PartsGrouped**/Root                                                                       | missing **Attachments**, **AttachmentByIndex**, **Unstable_PartsGrouped** | ❌→fixing                                                                               |
| messagePart        | Image/InProgress/Text + use{Data,File,Image,Reasoning,Source,Text}                                                     | missing use{**Source**,**File**,**Data**}                                 | ❌→fixing                                                                               |
| queueItem          | Remove/Steer/Text                                                                                                      | all ✅                                                                    | ✅                                                                                      |
| reasoning          | useScrollLock                                                                                                          | ✅ (behaviors/)                                                           | ✅                                                                                      |
| selectionToolbar   | Quote/Root                                                                                                             | all ✅ + hook                                                             | ✅                                                                                      |
| suggestion         | Description/Title/Trigger                                                                                              | all ✅                                                                    | ✅                                                                                      |
| thread             | Empty/If/Messages/Root/ScrollToBottom/Suggestion(s)/Viewport/ViewportFooter                                            | all ✅ + MessageByIndex; missing **Unstable_MessageById**                 | ⚠️→fixing                                                                               |
| threadList         | Items/LoadMore/New/Root                                                                                                | all ✅                                                                    | ✅                                                                                      |
| threadListItem     | Archive/Delete/Root/Title/Trigger/Unarchive                                                                            | all ✅                                                                    | ✅                                                                                      |
| threadListItemMore | Content/Item/Root/Separator/Trigger                                                                                    | aliased to ActionBarMore ✅                                               | ✅                                                                                      |

## B. Behavioral props declared in the API spec but NOT implemented (the real "shorting")

- **Thread.Viewport**: `scrollToBottomOnRunStart`, `scrollToBottomOnInitialize`, `scrollToBottomOnThreadSwitch`, `topAnchorMessageClamp`, and the `turnAnchor:'top'` top-anchor wiring (the behavior exists in behaviors/ but Viewport doesn't drive it). ❌→fixing
- **Composer.Input**: `focusOnRunStart`, `focusOnThreadSwitched`, `addAttachmentOnPaste`. ❌→fixing
- **ActionBar.Root**: full autohide float (`not-last` + hover reserve-space `-mb-7.5 min-h-7.5`, §11). ⚠️
- **MessagePart.Text** streaming reveal — present (streaming flag → solid-streamdown). ✅

## C. Styled set (Phase 4) — NOT yet diffed against assistant-ui's `packages/ui/src/components/assistant-ui/*`

Built so far: Thread/Composer/TooltipIconButton/ToolFallback/ToolGroup(pending)/Reasoning/ChainOfThought/Markdown/CollapsibleCard. NOT yet built (Phase 4b/4c remaining): styled **ActionBar**, **BranchPicker**, **AttachmentUI**, **FollowUpSuggestions**, **ThreadList/ThreadListSidebar**, **ToolGroup**. Will diff each against assistant-ui's styled component when built.

## D. Tool vocabulary (Phase 5) — NOT built yet

ApplyPatchDiff / BashCard / InlineTool / PermissionCard / QuestionCard / ReasoningGhost / DataPart / defineToolkit — ported from with-opencode in Phase 5.

## Fix plan (this pass, before resuming Phase 4)

1. messagePart: add use{Source,File,Data}. ✅ done
2. message: add Attachments + AttachmentByIndex + Unstable_PartsGrouped. ✅ done
3. composer: add Queue + Input focusOnRunStart/focusOnThreadSwitched/addAttachmentOnPaste. (in progress)
4. thread: add Unstable_MessageById + Viewport scrollToBottomOn{RunStart,Initialize,ThreadSwitch} + top-anchor wiring on turnAnchor='top'.
5. assistantModal: wire openOnRunStart.
6. actionBar: full autohide-float reserve-space behavior.
7. Add stories exercising each new behavior; keep coverage ≥ before.
