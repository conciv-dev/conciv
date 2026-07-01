# @conciv/ui-kit-chat — chat UI package + widget redesign

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> or superpowers:executing-plans. Phased build (Section 14); each task ends in an
> independently testable deliverable, verified via Storybook / package testkit — never the
> example app ([[no-tests-in-example-apps]]).

Status: design / decisions resolved 2026-06-28
Date: 2026-06-28
Owner: new `@conciv/ui-kit-chat` + `@conciv/ui-kit-system` + `@conciv/widget`

**Goal:** Build `@conciv/ui-kit-chat` — a clean-room SolidJS implementation of
assistant-ui's chat API (headless compound primitives + a neutral, themeable styled set) —
and rebuild the widget chat on top of it, fixing the chat UX defects (D1–D13) in the
process.

**Architecture:** Learn assistant-ui's API/behavior, implement natively on Solid. The
widget calls tanstack `useChat` once (SSE/streaming/AG-UI unchanged) and passes its return
into `<ChatProvider chat={...}>`; ui-kit-chat's context holds that `UseChatReturn` verbatim
(the single source of truth) plus a small view-state bag. Headless primitives read it via
`createMemo`-derived views — **no copied/mirrored chat state, no separate store, no
adapter object**. Base UI components come only from `@conciv/ui-kit-system`. The styled
set is neutral/token-driven; the conciv look is a theme layer.

**Tech stack:** SolidJS, `@conciv/ui-kit-system` (Ark-based), UnoCSS (presetWind4),
`@ark-ui/solid` headless **hooks only**, `@pierre/diffs` (Solid) for code/diff,
Streamdown/Solid for markdown. Reference (NOT a dependency): assistant-ui at
`/Users/dev/Public/web/assistant-ui`.

## Global Constraints

- **No assistant-ui dependency.** Clean-room. Learn from their source; ship our own code.
- **No `@ark-ui` _component_ imports anywhere** (oxlint `no-restricted-imports`,
  `.oxlintrc.json:36-58`). Base components come from `@conciv/ui-kit-system`. Ark
  **headless hooks** (`useListCollection`, `useFilter`) are allowed.
- **State = Solid primitives.** `createStore` + context for the chat store; `createMemo`/
  signals for derived state. No port of `@assistant-ui/store`/`core`.
- **API parity** with assistant-ui: compound parts (`Thread.Root`, `Composer.Input`,
  `MessagePrimitive.*`, `ActionBarPrimitive.*`, …), `ThreadComponents` slot overrides, and
  `defineToolkit(name → component)`.
- **Styled set = neutral + themeable** (token-driven light/dark); conciv = a theme layer.
- **Storybook**: every component, all states + props.
- **Code style** ([[code-style-hard-rules]]): functions not classes, no narration comments,
  no `any`/casts, no non-null `!`, no IIFE, no barrel re-export files. Compound namespaces
  via `Object.assign` (as ui-kit-system already does) are fine — that is not a barrel.
- **Verify** via Storybook + package testkit/ITs ([[whiteboard-bug-repro-real-app]],
  [[no-jsdom]], [[no-stubs-or-mocks]], native assertions [[test-assertions-native]]).

---

## 1. Why a package (not an in-place widget edit)

The widget chat (`packages/widget/src/chat/chat-panel.tsx`, 935 lines) couples layout,
disclosure, scroll, tool rendering, composer, and the tanstack runtime in one file, welded
to live state — hence widget Storybook coverage is 2/21. assistant-ui's lesson: separate a
**headless behavior layer** (compound primitives over a store) from a **styled layer**, and
adapt an **external store** for the runtime. Doing the same gives us: testable/storybookable
units, a reusable chat lib, and a thin widget container.

## 2. The runtime: reuse `useChat` directly — single source of truth

```
 SSE / AG-UI ──▶ tanstack useChat(...)  (called ONCE, in widget)
                       │   <ChatProvider chat={useChat return}>   (context, no copy)
                       ▼
        primitive hooks: useThread()/useMessageState()/useComposer()
            = createMemo views over chat.messages()/chat.status()   (derived, not stored)
                       ▼
        headless primitives (Thread.*, Message.*, Composer.*, ActionBar.*, …)
                       ▼
        styled set (neutral, themeable)  ──consumed by──▶  widget ChatPanel (thin)
```

`@tanstack/ai-solid`'s `useChat` already returns Solid `Accessor`s (`messages()`,
`status()`, `isLoading()`, `error()`) and actions (`sendMessage`, `append`, `reload`,
`stop`, `setMessages`, `addToolResult`, `addToolApprovalResponse`, `clear`) — verified in
`ai-solid@0.13.4` `dist/types.d.ts` (`BaseUseChatReturn`). It IS the reactive store. TanStack
AI ships **no** provider for sharing it across components (the `id` option is for _separate_
chats), so the canonical Solid pattern is: call `useChat` once, put its return in our own
context. **We do not mirror chat state into a second store** — that would be two sources of
truth. This is assistant-ui's external-store idea, but since `useChat` is already reactive
we reference it directly instead of syncing into a copy.

## 3. The context value + derived views (no copied chat state)

`ChatContext` holds the `UseChatReturn` value verbatim (plus a small view-state bag). All
"store shape" assistant-ui exposes is derived **on read** with `createMemo`, never stored:

- `useThread()` → `{ isEmpty, isRunning, isDisabled, turns }` (canonical; `turns` =
  coalesced `Turn[]`). `isRunning := status() === 'streaming' || status() === 'submitted'`
  — defined ONCE here; everything (ActionBar `hideWhenRunning`, Reload disabled) reads it.
- `useMessageState(id)` / `usePart(...)` → narrowed views over the message's parts (our
  tanstack `MessagePart` discriminated union — reuse it directly, no remap).
- `useComposer()` → the draft (owned view-state, see below) + `chat.sendMessage`/`chat.stop`.
- turn coalescing / segment grouping / tool-call↔result pairing → `createMemo` (port
  `coalesceTurns`/`groupSegments`/`pairResults` from `chat-panel.tsx:41-270`). These are
  pure functions recomputed inside the memo — never cached in the view-state bag.

**The state ui-kit-chat owns is view-state `useChat` doesn't track:** the composer **draft
text**, per-card collapsed (keyed by `toolCallId`, NOT part index — survives streaming id
churn; GC orphaned keys when the message list changes), chain-of-thought pinned, message
hover, and viewport `{ isAtBottom, turnAnchor,
topAnchorTurn }`. That's a separate concern (UI), not a copy of chat data. Kept in a small
`createStore`/signals bag in context.

## 4. Provider + the storybook seam

The binding is just `<ChatProvider chat={chat}>` where `chat = useChat(...)`. The context
type is `UseChatReturn` (tanstack's own type) + the view-state bag — no bespoke adapter
interface to keep in sync. For Storybook we run the **real** `useChat` with a **fake
transport** — a fake `ConnectionAdapter` whose `connect()` yields canned `StreamChunk`s
(exactly TanStack's own `createMockConnectionAdapter` test pattern, `ai-client/tests/
test-utils.ts`), so the real stream processor and state machine drive every state and
transition offline. **No mocks of `useChat`'s return.** API spec §6.1. This is the ONLY
widget↔package seam.

## 5. Package layout

```
packages/ui-kit-chat/
  src/
    store/           ChatProvider, useChatContext, derived views (useThread/useComposer),
                     grouping (coalesceTurns/groupSegments/pairResults, ported from
                     chat-panel.tsx:41-270), view-state bag, storyConnection (fake
                     ConnectionAdapter yielding StreamChunks) for stories — real useChat, no mocks
    primitives/      thread/ message/ message-part/ composer/ action-bar/ action-bar-more/
                     branch-picker/ chain-of-thought/ reasoning/ attachment/ suggestion/
                     error/ assistant-modal/ thread-list/ thread-list-item/
                     thread-list-item-more/ queue-item/ selection-toolbar/
                     + util/ (Primitive slot shim, createActionButton)
    behaviors/       useThreadAutoScroll, useTopAnchorReserve, useScrollLock, useSizeHandle
    styled/          thread, composer, tooltip-icon-button, tool-fallback, tool-group,
                     reasoning, chain-of-thought, attachment-ui, suggestions, action-bar,
                     branch-picker, thread-list, thread-list-sidebar, markdown (binding)
    tools/           apply-patch-diff, bash-card, inline-tool, permission-card,
                     reasoning-ghost, define-toolkit  (ask UI = existing GenUi)
    theme/           neutral tokens (light/dark) + conciv theme layer
  .storybook/
```

No barrel `index.ts` inside `ui-kit-chat`'s primitive/styled folders; each primitive family
exports a compound object
(`export const Thread = Object.assign(Root, { Viewport, Messages, ... })`).
The package's single public entry `src/index.tsx` (the package boundary, like
`ui-kit-system/index.tsx` already is) is allowed — the no-barrel rule targets internal
folder re-export barrels, not the package entry.

## 6. Headless primitive inventory (from the assistant-ui API map)

Build these compound namespaces (parts abbreviated; full list in the API map below). Each
part is a Solid component over the store; buttons via a shared `createActionButton`.

- **Thread**: Root, Viewport, ViewportProvider, ViewportFooter, Messages, MessageByIndex,
  ScrollToBottom, Suggestion(s), Empty, If.
- **Message**: Root, Parts, PartByIndex, If, Attachments, Error.
- **MessagePart**: Text, Image, InProgress.
- **Composer**: Root, Input (autosize), Send, Cancel, AddAttachment, Attachments,
  AttachmentDropzone, If, Quote/QuoteText/QuoteDismiss, Dictate/StopDictation/Transcript,
  Unstable_TriggerPopover\* (@/slash). (Dictation/trigger gated on a widget handler/adapter.)
- **ActionBar**: Root (autohide/float), Copy, Reload, Edit, ExportMarkdown, Speak/
  StopSpeaking, FeedbackPositive/Negative. (Speak/Feedback gated → null until a handler.)
- **ActionBarMore / ThreadListItemMore**: Root/Trigger/Content/Item/Separator → ui-kit Menu.
- **BranchPicker**: Root, Previous, Next, Count, Number. (Built; inert until a branch layer.)
- **ChainOfThought**: Root, AccordionTrigger, Parts.
- **Attachment**: Root, Thumb, Name, Remove.
- **Suggestion**: Title, Description, Trigger.
- **Error**: Root, Message.
- **ThreadList / ThreadListItem / ThreadListItemMore**: Root, New, Items, LoadMore / Root,
  Trigger, Title, Archive, Unarchive, Delete / Root, Trigger, Content, Item, Separator
  (→ ui-kit Menu). (Backed by our session store, not tanstack.)
- **AssistantModal**: Root, Trigger, Content, Anchor → ui-kit Popover.
- **QueueItem / SelectionToolbar**: QueueItem Text/Steer/Remove; SelectionToolbar Root/Quote.
- **Utilities**: `Primitive` (Slot/`as`/render shim over Ark's `ark.*` or `Dynamic`),
  `createActionButton` (renders null when the behavior hook gives no handler).

## 7. Styled set (neutral, themeable)

Targets: `Thread` (shell), `Composer`, `TooltipIconButton` (the most-reused atom),
`ToolFallback`, `ToolGroup`, `Reasoning`, `ChainOfThought`, `AttachmentUI`,
`FollowUpSuggestions`, `ActionBar`, `BranchPicker`, `ThreadList`, `ThreadListSidebar`,
`Markdown` (Streamdown binding). Each composes ui-kit-system bases + neutral tokens.

## 8. Base primitives ui-kit-system MUST add first (Phase 0)

ui-kit-system today exports only: Button, Collapsible, HoverCard, ScrollArea, Combobox,
Dialog, TextField, Progress, EnvironmentProvider. **Missing and required:**

| Base                   | Needed by                                                                                            | Status                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Tooltip**            | TooltipIconButton (everywhere)                                                                       | add (shared with whiteboard plan)                 |
| **Menu**               | ActionBarMore, ThreadListItemMore                                                                    | add (shared with whiteboard plan)                 |
| **Popover**            | AssistantModal (and replaces the widget's hand-rolled `@floating-ui` popover in `shell/popover.tsx`) | **add — net new**                                 |
| **Toast**              | notices (D5)                                                                                         | add                                               |
| **Avatar**             | message/author, thread-list                                                                          | add (shared with whiteboard plan)                 |
| **Tabs**, **Switch**   | model selector / settings / artifact panel                                                           | add (shared with whiteboard plan)                 |
| TextField **autosize** | Composer.Input                                                                                       | extend TextField or add `solid-textarea-autosize` |

Coordinate with [[whiteboard-comments-ui-redesign]] (it adds Avatar/Menu/Tooltip/Switch/
Tabs) to avoid double work.

## 9. Tool vocabulary — port from `examples/with-opencode` (browser app)

with-opencode is a Next.js **browser** app (not the CLI `with-react-ink`); its tool cards
are ordinary DOM, directly portable to Solid. Port into `ui-kit-chat/tools/`:

- **apply-patch-diff** ← `tool-ui-apply-patch.tsx`: Claude Code v2 patch → unified diff;
  lift the parse functions verbatim, render via our `@conciv/solid-diffs` (Pierre)
  instead of React Pierre. ([[tool-card-visual-design]] — code always via Pierre.)
- **bash-card** ← `tool-ui-bash.tsx`: collapsible `$ cmd` + stdout/stderr + exit-code.
- **inline-tool** ← `tool-ui-inline.tsx`: `ToolCallShell` one-line rows (read/grep/glob/
  web) + generic MCP fallback (the collapsed-by-default model, D2).
- **permission-card / question-card** ← `opencode-permission-card.tsx` +
  `opencode-tool-interactions.tsx`: approval + ask-question, stacked by `toolCallId`
  ([[native-approval-hybrid]]).
- **reasoning-ghost** ← `reasoning-ghost.tsx`: chain-of-thought group styling.
- **data-part** ← `opencode-data-part.tsx`: render/suppress non-tool agent events.
- **define-toolkit** ← `toolkit.tsx`: name→component map ([[tool-ui-tanstack-convention]]).

Our existing `@conciv/tool-ui` cards (page-action, file-edit/read, search, shell, todo)
fold into this toolkit shape.

## 10. Defects this fixes (carried from the audit)

| #     | Defect                                                                  | Fixed by                                                                                             |
| ----- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| D1    | Assistant bubble width-jumps on expand (`chat-panel.tsx:83-86,774-782`) | Styled Thread: assistant = full-width no bubble, user = bubble (assistant-ui model); `min-w-0` chain |
| D2    | Tool cards default open (`tool-ui/shell.tsx:48`)                        | Collapsed-by-default; auto-expand only on approval                                                   |
| D3    | Two disclosure mechanisms (`generic.tsx:40`, `chat-panel.tsx:114`)      | Single Collapsible via ui-kit-system                                                                 |
| D4    | Native `title=` tooltips                                                | TooltipIconButton                                                                                    |
| D5    | Hand-rolled toast (`chat-panel.tsx:706-713,828`)                        | ui-kit Toast                                                                                         |
| D6    | Raw JSON `<pre>` dumps                                                  | styled `<pre>` (parity; JsonTreeView dropped)                                                        |
| D7/D8 | Touch targets, uneven states                                            | Phase 8 polish (44px hit area)                                                                       |
| D9    | No process/answer rhythm                                                | Thread grouping (thinking/tool groups via `groupSegments`)                                           |
| D10   | Crude scroll, no top-anchor                                             | `behaviors/` top-anchor + autoscroll + scroll-to-bottom                                              |
| D11   | No per-message action bar                                               | ActionBar primitive + styled (Copy + Reload)                                                         |
| D12   | No branch picker                                                        | BranchPicker built but inert (tanstack has no branch model)                                          |
| D13   | Collapse jump                                                           | `useScrollLock`                                                                                      |

## 11. Behaviors to implement natively (Solid ports of assistant-ui)

- **useThreadAutoScroll** ← `useThreadViewportAutoScroll.ts:111-190`: 1px tolerance,
  pending-intent decoupled from scroll detection, cancel on pointerdown / scroll-up.
- **useTopAnchorReserve** ← `topAnchor/*`: pin the new user turn to top + reserve spacer;
  Resize/Mutation observers; `computeTopAnchorSlack`.
- **useScrollLock** ← `reasoning/useScrollLock.ts:31-109`: lock scroll over collapse anim.
- **ScrollToBottom** button: hidden when at bottom.
- **ActionBar autohide/float** ← `ActionBarRoot.tsx`: not-last + hover, reserve space
  (`-mb-7.5 min-h-7.5`), hideWhenRunning.
- **Long-thread perf** = `content-visibility:auto` + `contain-intrinsic-size` on the
  variable-height thread rows. **`tool-ui/virtual-lines.tsx` stays** — it is a separate,
  fixed-row-height text virtualizer (uniform monospace lines: terminal output / large tool
  dumps), not a thread virtualizer, so it does not conflict with top-anchor. Reuse it for
  big text blocks; the thread itself uses content-visibility (rows are variable height).

## 12. Theming

`theme/` ships neutral semantic tokens (`--chat-*`) with light/dark defaults; the styled
set references only those. A `conciv` theme maps `--chat-*` → our `--pw-*`
(dark glass + magenta). Shadow-DOM `@property` hoist still applies
([[unocss-wind4-shadow-dom]]).

## 13. Storybook

Every primitive part and styled component gets stories that run the REAL `useChat` behind a
fake transport (`storyConnection` = fake `ConnectionAdapter` yielding `StreamChunk`s — §6.1); no server, no app, no
mocks. Cover all states: empty/streaming/settled/error, tool running/complete/
error/approval, single vs multi-branch, hover/focus/disabled, light + dark + conciv
themes. ([[no-test-ids-in-code]]; play funcs assert via roles/text.)

## 14. Build phases (task list)

**Phase 0 — base primitives (ui-kit-system):** Tooltip, Menu, Popover, Toast, Avatar,
Tabs, Switch, TextField-autosize — each + stories.
**Phase 1 — package scaffold + context:** package/tsconfig/uno/storybook; `Primitive` shim;
`createActionButton`; `ChatProvider`/`useChatContext` over the `useChat` return (no copied
state) + `createMemo` derived views + view-state bag + `storyConnection` (fake
ConnectionAdapter, TanStack's own test pattern) for stories (real useChat, no mocks).
**Phase 2 — headless primitives (full API parity):** Thread, Message, MessagePart, Composer
(incl. Quote/Dictate/TriggerPopover), ActionBar(+More) (Copy/Reload/Edit/ExportMarkdown/
Speak/Feedback), ChainOfThought, Suggestion, Error, ThreadList(+Item), AssistantModal,
BranchPicker (inert), QueueItem, SelectionToolbar. Gated actions render null until a handler
exists (API spec §7). (Grouped into ~5 tasks.)
**Phase 3 — behaviors:** autoscroll, top-anchor, scrollToBottom, useScrollLock.
**Phase 4 — styled set (neutral/themeable):** Thread shell (assistant full-width/user
bubble), Composer, TooltipIconButton, ToolFallback/ToolGroup, Reasoning, ChainOfThought,
AttachmentUI, Suggestions, ActionBar (full), BranchPicker, ThreadList/Sidebar, Markdown binding.
**Phase 5 — tool vocabulary:** apply-patch-diff (Pierre), bash-card, inline-tool,
permission card (→ tanstack approval), reasoning-ghost, defineToolkit; fold in existing
tool-ui cards. (Ask/question UI = existing GenUi.)
**Phase 6 — widget integration:** `ChatProvider chat={useChat(...)}`; ChatPanel → thin
container over ui-kit-chat; remove hand-rolled notice/title/details; wire composer controls

- extension slots + selectors; D1 regression IT.
  **Phase 7 — theming:** neutral tokens + conciv theme layer; verify in widget shadow DOM.
  **Phase 8 — polish + storybook sweep:** touch targets (44px)/states (D7/D8); Storybook
  coverage for all components/states; responsive (PiP, quick-terminal, ≥300px).
  **Phase 9 — future enhancements (primitives already built, just not lit):** the branch
  layer that makes BranchPicker live (sibling map + `setMessages` switch); a TTS/feedback
  handler to light Speak/Feedback; JsonTreeView (only if `<pre>` proves insufficient);
  thread-list sidebar app shell.

## 15. Verification

Per slice: Storybook (real browser) for ui-kit-system bases and ui-kit-chat components;
widget testkit/ITs for integration ([[widget-it-newpage-not-newcontext]],
[[widget-it-needs-core-built]]). D1 regression: expand a wide diff card, assert turn edges
unchanged, only height grows. Never the example app.

## 16. Decisions

**All resolved (2026-06-28). No open questions.**

1. Clean-room Solid implementation; **no assistant-ui dependency.**
2. **Canonical data model = tanstack** `UIMessage`/`MessagePart`/`ToolCallPart`/
   `ToolResultPart`/`ThinkingPart`/`StructuredOutputPart` (ai-client 0.16.3). **No new
   domain types** — every component is bound to tanstack concepts (full map: API spec §1.1).
   Where assistant-ui has a concept tanstack lacks, it is dropped (API spec §7).
3. State: ui-kit-chat context = `useChat` return (single source of truth) + a small
   view-state bag (collapsed/pinned/hover/viewport). No copied chat state.
4. **API parity** with assistant-ui (compound parts, slots, `defineToolkit`).
5. Base components only from ui-kit-system (Ark hooks OK). Tooltip/Menu/Popover built in
   Phase 0 here (not gated on the whiteboard plan).
6. Styled set = **neutral + themeable**; conciv = theme layer. Primary tool reference =
   `with-opencode` (browser). Turn model: assistant full-width/no-bubble, user bubble; tool
   cards collapsed by default, auto-expand on `approval-requested`.
7. **Build the FULL primitive API (assistant-ui parity).** Capability model (API spec §7):
   each action renders `null` when no handler exists, so we ship everything and the widget
   lights up what it supports. Live now: Copy/Reload/ExportMarkdown, Composer quote +
   selection-toolbar. Built + gated (null until a handler/adapter is provided):
   Edit, Speak, Feedback, Dictate, @/slash trigger-popover, QueueItem.
8. **Branch picker: built but INERT** — `UIMessage` has no sibling/branch model, so
   `branchCount===1` and it renders nothing. The one genuinely-deferred feature; goes live
   only if we add a branch layer (sibling map in view-state + `setMessages` switch).
9. **JsonTreeView: not built** — args/results render as styled `<pre>` (parity); revisit
   only if `<pre>` proves insufficient.
10. **Scroll perf: `content-visibility`** for the variable-height thread rows. **Keep
    `tool-ui/virtual-lines.tsx`** — a fixed-row-height _text_ virtualizer (terminal / large
    dumps), a different concern, no conflict with top-anchor.
11. **Touch targets: 44px hit area** via padding (glyph unchanged).
12. Source message part = n/a (our agent emits none); slot exists, unused.

## 17. assistant-ui reference map (source of the patterns)

Studied at `/Users/dev/Public/web/assistant-ui` @ `523e0b563`. React + Radix +
Tailwind; we reimplement on Solid + ui-kit-system + UnoCSS. Headless behavior =
`packages/react/src/primitives/*` (thin: DOM + Slot + store). Styled set =
`packages/ui/src/components/assistant-ui/*`. Tool vocabulary = `examples/with-opencode/
components/tools/*`. App shell = `templates/default/app/assistant.tsx`. Gen-UI/MCP =
`examples/with-generative-ui`. Canvas split-pane = `examples/with-artifacts`. Scroll/stick
= `examples/with-virtualized-thread`. Key files cited inline in Sections 9–11.

## Appendix A — Full component & API inventory

> **Full prop-by-prop interfaces (Solid) live in the companion spec
> `2026-06-28-ui-kit-chat-api.md`** — extracted verbatim from assistant-ui source and
> translated to Solid, with `file:line` citations. This appendix is the summary; that doc is
> what you build against.

Every component to build, with its API (Solid). Compound parts accept the shared `Primitive`
props (`class`, `children`, `as?`, `render?`) plus those listed. Buttons render `null` when
their action is unavailable (assistant-ui convention). This is the authoritative build list.

### A.1 ui-kit-system base primitives (Phase 0) — Ark wrappers, compound

| Component            | Parts / API                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Tooltip`            | `Tooltip.Root({openDelay?,closeDelay?})`, `.Trigger`, `.Positioner`, `.Content`, `.Arrow`                                                  |
| `Menu`               | `Menu.Root({onSelect?})`, `.Trigger`, `.Positioner`, `.Content`, `.Item({value,disabled?})`, `.ItemGroup`, `.ItemGroupLabel`, `.Separator` |
| `Popover`            | `Popover.Root({open?,onOpenChange?,positioning?})`, `.Trigger`, `.Anchor`, `.Positioner`, `.Content`, `.Arrow`, `.CloseTrigger`            |
| `Toast`              | `createToaster()`, `Toast.Provider`, `Toaster`, `toast.create/dismiss`; item parts `.Root/.Title/.Description/.CloseTrigger`               |
| `Avatar`             | `Avatar.Root`, `.Image({src})`, `.Fallback`                                                                                                |
| `Tabs`               | `Tabs.Root({value,onValueChange})`, `.List`, `.Trigger({value})`, `.Content({value})`, `.Indicator`                                        |
| `Switch`             | `Switch.Root({checked,onCheckedChange,disabled?})`, `.Control`, `.Thumb`, `.Label`                                                         |
| `TextField` autosize | extend existing `TextField` with `autosize?: boolean`, `minRows?`, `maxRows?`                                                              |

### A.2 ui-kit-chat headless primitives (Phase 2)

**Thread** — `thread/`

- `Thread.Root()`
- `Thread.Viewport({autoScroll?:boolean; turnAnchor?:'top'|'bottom'})` — owns scroll behaviors
- `Thread.ViewportFooter()` — height-measured sticky footer (composer slot)
- `Thread.Messages({components:{UserMessage,AssistantMessage,SystemMessage?,EditComposer?}})`
- `Thread.MessageByIndex({index})`, `Thread.Unstable_MessageById({id})`
- `Thread.ScrollToBottom()` — null when at bottom
- `Thread.Suggestion({prompt:string; method?:'replace'; autoSend?:boolean})`, `Thread.Suggestions({components})`
- hooks: `useThread()→{isEmpty,isRunning,isDisabled,turns}`, `useThreadViewport()→{isAtBottom,scrollToBottom}`

**Message** — `message/`

- `Message.Root()` — provides message context + hover
- `Message.Parts({components:{Text?,Reasoning?,Source?,File?,Image?,tools?:{by_name?:Record<string,Comp>,Fallback?:Comp},Empty?}})`
- `Message.PartByIndex({index})`, `Message.If({user?,assistant?,system?,hasBranches?,copied?,last?,hasContent?})`
- `Message.Attachments({components})`, `Message.Error()`, `Message.Unstable_PartsGrouped()`
- hooks: `useMessage()→message state`

**MessagePart** — `message-part/`

- `MessagePart.Text({component?})`, `MessagePart.Image()`, `MessagePart.InProgress()`
- accessors: `useMessagePartText/Image/Reasoning/Source/File/Data()`

**Composer** — `composer/`

- `Composer.Root({onSubmit?})` (form)
- `Composer.Input({autoFocus?,submitOnEnter?:boolean,cancelOnEscape?:boolean,rows?,placeholder?,component?})`
- `Composer.Send()`, `Composer.Cancel()`, `Composer.AddAttachment()`
- `Composer.Attachments({components})`, `Composer.AttachmentDropzone()`
- `Composer.If({editing?,hasAttachments?})`, `Composer.Quote()`, `Composer.QuoteDismiss()`
- hooks: `useComposer()→{value,setValue,send,cancel,isEmpty,isDisabled,canCancel}`

**ActionBar** — `action-bar/`

- `ActionBar.Root({hideWhenRunning?:boolean; autohide?:'always'|'not-last'|'never'; autohideFloat?:'always'|'single-branch'|'never'})`
- `.Copy()`, `.Reload()`, `.Edit()`, `.Speak()`, `.StopSpeaking()`, `.FeedbackPositive()`, `.FeedbackNegative()`, `.ExportMarkdown()`

**ActionBarMore / ThreadListItemMore** — `action-bar-more/`, `thread-list-item-more/` (→ ui-kit `Menu`)

- `.Root()`, `.Trigger()`, `.Content()`, `.Item({onSelect})`, `.Separator()`

**BranchPicker** — `branch-picker/`

- `BranchPicker.Root({hideWhenSingleBranch?:boolean})`, `.Previous()`, `.Next()`, `.Number()`, `.Count()`

**ChainOfThought** — `chain-of-thought/`

- `ChainOfThought.Root()`, `.AccordionTrigger()` (store-driven collapse), `.Parts()`

**Attachment** — `attachment/`

- `Attachment.Root()`, `.Thumb()`, `.Name()`, `.Remove()`

**Suggestion** — `suggestion/`

- `Suggestion.Title()`, `.Description()`, `.Trigger({prompt,method?,autoSend?})`

**Error** — `error/`

- `Error.Root()`, `.Message()`

**ThreadList / ThreadListItem** — `thread-list/`, `thread-list-item/`

- `ThreadList.Root()`, `.New()`, `.Items({components:{ThreadListItem}})`, `.LoadMore()`
- `ThreadListItem.Root()`, `.Trigger()`, `.Title()`, `.Archive()`, `.Unarchive()`, `.Delete()`

**AssistantModal** — `assistant-modal/` (→ ui-kit `Popover`)

- `.Root({openOnRunStart?:boolean})`, `.Trigger()`, `.Content()`, `.Anchor()`

**QueueItem / SelectionToolbar** (Phase 9 optional)

- `QueueItem.Text/.Steer/.Remove`; `SelectionToolbar.Root/.Quote`

**Utilities** — `util/`

- `Primitive.div/button/form/span/img` — `{as?,render?,...domProps}` slot shim (no Ark component)
- `createActionButton(name, useHook)` — button whose onClick/disabled come from a hook

### A.3 Behaviors (Phase 3) — `behaviors/`

- `useThreadAutoScroll(viewport, {autoScroll})→{isAtBottom,scrollToBottom}`
- `useTopAnchorReserve({viewport,anchorEl,targetEl,clamp})`
- `useScrollLock(el, {durationMs})`
- `useSizeHandle(el, onResize)`

### A.4 Styled set (Phase 4) — neutral/themeable

- `Thread({welcome?,suggestions?,components?,composer?})`
- `Composer({placeholder?})`
- `TooltipIconButton({tooltip:string; side?:'top'|'bottom'|'left'|'right'; ...ButtonProps})`
- `ToolFallback({toolName,args,result,status})`, `ToolGroup({startIndex,endIndex})`
- `Reasoning({text,streaming?})`, `ChainOfThought({streaming?,durationMs?})`
- `AttachmentUI()`, `FollowUpSuggestions({suggestions})`
- styled `ActionBar()`, styled `BranchPicker()`
- `ThreadList()`, `ThreadListSidebar()`
- `Markdown({content,streaming?})` (Streamdown/Solid binding)

### A.5 Tool vocabulary (Phase 5) — `tools/`

- `ApplyPatchDiff({input|patch:string; status})` — v2 patch→unified diff via Pierre
- `BashCard({command,stdout?,stderr?,exitCode?,status})`
- `InlineTool({icon,name,summary?,status,children?})` / `ToolCallShell(...)`
- `PermissionCard({tool,input,options,onDecision:(allow:boolean,scope?)=>void})`
- `QuestionCard({question,options?,onAnswer:(text)=>void})`
- `ReasoningGhost({text,streaming?})`
- `DataPart({part})` — renders/suppresses non-tool agent events
- `defineToolkit({tools:Record<string,ToolComponent>, fallback?:ToolComponent})`

### A.6 Store/context (Phase 1) — `store/`

- `ChatProvider({chat:UseChatReturn, children})`
- `useChatContext()→UseChatReturn & {view:ViewState}`
- `useThread()`, `useMessageState(id)`, `usePart(...)`, `useComposer()` (createMemo views)
- Storybook = real `useChat` + `storyConnection` (fake `ConnectionAdapter`), no mocks (§6.1)
- view-state: `{collapsed:Record<id,bool>, pinned:Record<id,bool>, hovering:id|null, viewport:{isAtBottom,turnAnchor,topAnchorTurn}}`

**Count:** 8 base primitives (Phase 0) + ~17 headless primitive families (~90 parts) + 4
behaviors + ~16 styled components + 8 tool components + store/context. Every item above is a
task deliverable with its own stories.

## 18. Migration & replacement map — every existing part → its fate

The end goal is **the real widget rendering through `@conciv/ui-kit-chat` in the running
app, with the old chat stack deleted.** Building the package is not done; _cutting over and
removing the old code_ is. Below, every existing file and its disposition.
Legend: **REPLACE→** (delete, render via the new component) · **MOVE→** (relocate into
ui-kit-chat) · **REWIRE** (keep file, point it at ui-kit-chat) · **KEEP** (unchanged).

### `packages/tool-ui/` — ABSORBED into `@conciv/ui-kit-chat`, then the package is DELETED

(types `ToolCardProps`/`ToolCardEntry` stay in `@conciv/protocol/tool-view-types` — the shared home.)

| File                                          | Fate                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `shell.tsx` (ToolCard chrome)                 | REPLACE→ ui-kit-chat styled `ToolFallback`/`ToolGroup`                                          |
| `thinking.tsx` (ChainOfThought, Reasoning)    | REPLACE→ ui-kit-chat `ChainOfThought` + `Reasoning`                                             |
| `tool-call.tsx` (route by name)               | REPLACE→ `Message.Parts` tools dispatch + `defineToolkit` (ToolCardEntry[])                     |
| `approval-bar.tsx`                            | REPLACE→ ui-kit-chat `PermissionCard`                                                           |
| `now-line.tsx` + `now-title.ts`               | MOVE→ ui-kit-chat styled "now line" (live tool indicator)                                       |
| `done-card.tsx`                               | MOVE→ ui-kit-chat styled `DoneCard`                                                             |
| `virtual-lines.tsx`                           | MOVE→ ui-kit-chat (fixed-row text virtualizer; kept)                                            |
| `util.ts` / `diff-options.ts` / `fixtures.ts` | MOVE→ ui-kit-chat (`types.ts` → use protocol types)                                             |
| `cards/file-edit.tsx`                         | REPLACE→ `ApplyPatchDiff` (Pierre)                                                              |
| `cards/file-read.tsx`                         | MOVE→ ui-kit-chat `FileRead` card                                                               |
| `cards/shell.tsx`                             | REPLACE→ `BashCard`                                                                             |
| `cards/search.tsx`                            | REPLACE→ `InlineTool` (web)                                                                     |
| `cards/todo.tsx`                              | MOVE→ ui-kit-chat `Todo` card                                                                   |
| `cards/generic.tsx`                           | REPLACE→ ui-kit-chat `ToolFallback`                                                             |
| `cards/page-action.tsx`                       | MOVE→ **widget-side** `ToolCardEntry` (conciv page tool, app-specific — not in the neutral lib) |
| `cards/ui-chip.tsx`                           | MOVE→ widget-side `ToolCardEntry` (or drop if unused)                                           |
| all `*.stories.tsx`                           | REPLACE→ ui-kit-chat stories (real useChat + storyConnection)                                   |

### `packages/widget/src/chat/`

| File                         | Fate                                                                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat-panel.tsx` (935 lines) | REPLACE→ a thin `chatPanelDef`/`ChatPanel` **container**: calls `useChat`, wraps in `<ChatProvider>`, renders ui-kit-chat `<Thread>`/`<Composer>`; keeps the session-load/switch/compact/divider/duration/approval **wiring**; deletes all layout/grouping/rendering (now ui-kit-chat) |
| `gen-ui.tsx`                 | KEEP (conciv GenUi over `CONCIV_UI_EVENT`); rendered into a ui-kit-chat thread slot                                                                                                                                                                                                    |
| `markdown.tsx`               | REPLACE→ ui-kit-chat `Markdown` (solid-streamdown binding); delete                                                                                                                                                                                                                     |

### `packages/widget/src/shell/`

| File                               | Fate                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `popover.tsx` (`@floating-ui/dom`) | REPLACE→ ui-kit-system `Popover` / ui-kit-chat `AssistantModal`; delete (drop the floating-ui dep)       |
| `approval-modal.tsx`               | REWIRE→ renders ui-kit-chat `PermissionCard` (out-of-band decision wiring stays)                         |
| `empty-state.tsx`                  | REPLACE→ ui-kit-chat `Thread.Empty`/`Welcome` + `Suggestions` (keep the `EmptyStateSlot` extension seam) |
| `fab-robot.tsx`                    | KEEP (mascot); becomes the `AssistantModal.Trigger` content                                              |
| `quick-terminal.tsx`               | REWIRE→ each pane renders ui-kit-chat `<Thread>`/`<Composer>` instead of the old ChatPanel internals     |
| `widget-shell.tsx`                 | REWIRE→ hosts `AssistantModal` + the ui-kit-chat thread; panel registration unchanged                    |
| `pip.tsx`                          | KEEP                                                                                                     |

### `packages/widget/src/composer/`

| File                                                                                              | Fate                                                                         |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `model-selector.tsx`, `session-selector.tsx`                                                      | KEEP (already Ark Combobox) → REWIRE as ui-kit-chat `Composer` slot controls |
| `session-info.tsx`, `new-session-action.tsx`, `compact-action.tsx`, `open-in-terminal-action.tsx` | REWIRE into the ui-kit-chat `Composer` action slot                           |

### Consumers that MUST switch imports `@conciv/tool-ui` → `@conciv/ui-kit-chat`

| File                                                               | Action                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `packages/widget/src/mount.tsx`                                    | import tool cards/Thread from ui-kit-chat; `chatPanelDef` container                   |
| `packages/widget/src/styles.css`, `vite.config.ts`, `package.json` | swap `@conciv/tool-ui` dep → `@conciv/ui-kit-chat`; drop tool-ui + `@floating-ui/dom` |
| `packages/extensions/whiteboard/src/client/pins/thread.tsx`        | import `ToolCard`/types from ui-kit-chat (+ package.json)                             |
| `packages/extensions/test-runner/src/tool/card.tsx`                | import from ui-kit-chat (+ package.json)                                              |
| `packages/protocol/src/tool-view-types.ts`                         | KEEP (the shared `ToolCardProps`/`ToolCardEntry` type home)                           |

### Cutover acceptance (the real "used in the app" gate — see TASKS Definition of Done)

- `grep -rn "@conciv/tool-ui" packages --include=*.ts --include=*.tsx --include=*.json | grep -v node_modules | grep -v dist` → **zero** (package deleted, all consumers migrated).
- `ls packages/tool-ui` → does not exist.
- `grep -rn "@floating-ui/dom" packages/widget` → zero (popover replaced).
- `packages/widget/package.json` depends on `@conciv/ui-kit-chat`.
- `mount.tsx`/`widget-shell`/`quick-terminal` render the thread via ui-kit-chat components, not the old chat-panel/tool-ui internals.
- The running example app shows the widget chat rendered by ui-kit-chat; widget testkit + extension ITs (whiteboard, test-runner) still pass.

## 18.1 Complete `@conciv/tool-ui` public surface + infra → new home (nothing left behind)

Full export inventory (from `tool-ui/src/index.tsx`) — every symbol must land somewhere before delete:

| Export                                                                                                                        | New home                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `ToolCallCard`, `ToolCallCardProps` (by-name dispatcher)                                                                      | ui-kit-chat `Message.Parts` tools dispatch (matches `ToolCardEntry[]` by name)                                                       |
| `builtinToolCards: ToolCardEntry[]`                                                                                           | split: generic cards → ui-kit-chat `builtinToolCards`; `pageActionTool`, `uiTool` → **widget-side** entries spread in at `mount.tsx` |
| `ToolCard` (chrome), `GenericCard`                                                                                            | ui-kit-chat styled `ToolFallback`/`ToolGroup`                                                                                        |
| `ApprovalBar`                                                                                                                 | ui-kit-chat `PermissionCard`                                                                                                         |
| `ShellCard/shellTool`, `FileEditCard/fileEditTool`, `FileReadCard/fileReadTool`, `SearchCard/searchTool`, `TodoCard/todoTool` | ui-kit-chat tool vocabulary (BashCard/ApplyPatchDiff/FileRead/InlineTool/Todo), each as a `ToolCardEntry`                            |
| `PageActionCard/pageActionTool`, `UiCard/uiTool`                                                                              | **widget-side** (conciv-specific) `ToolCardEntry`s                                                                                   |
| `ChainOfThought`, `Reasoning`                                                                                                 | ui-kit-chat ChainOfThought + Reasoning                                                                                               |
| `NowLine`, `nowTitle`                                                                                                         | ui-kit-chat styled now-line + helper                                                                                                 |
| `DoneCard`                                                                                                                    | ui-kit-chat styled DoneCard                                                                                                          |
| `parseInput`, `resultText`, `toolGlyph`, `ToolGlyph`                                                                          | ui-kit-chat `util` (note: `parseInput` reads `part.arguments` — [[tanstack-part-input-empty]])                                       |
| `ToolCardProps`, `ToolViewCtx`, `ToolAccent`, `ToolCardEntry` (types)                                                         | STAY in `@conciv/protocol/tool-view-types` (the type home); consumers import from there                                              |

Infra that travels with the move (delete-blockers — handle BEFORE removing tool-ui):

- **`tool-ui/tokens.css` + `tool-ui.css`** — the `--pw-*` design tokens + tool-card CSS the widget imports via `styles.css`. RE-HOME to ui-kit-chat (`theme/` exports `tokens.css`) or ui-kit-system; update `widget/src/styles.css` `@import` and any package `exports` map. **Deleting tool-ui without this breaks every `--pw-*` style.**
- **`js-beautify`** (tool-ui dep, used by `util.ts` HTML pretty-print for page DOM reads — [[page-dom-html-formatting]]) + the `vite.config.ts` optimizeDeps workaround: travel with `pageActionTool` to the widget side.
- **`widget/uno.config.ts`** scan glob `../tool-ui/src/**` → change to `../ui-kit-chat/src/**`.
- **solid-diffs / solid-streamdown** consumers (`tool-ui/diff-options.ts`, `cards/file-read`, `cards/file-edit`, `cards/page-action`, `widget/chat/markdown.tsx`) → re-home into ui-kit-chat (diffs) + widget page-action (page reads).
- **Stories**: every `tool-ui/**/*.stories.tsx` (shell, thinking, tool-call, done-card, now-line, all cards) → MOVE to ui-kit-chat stories (real useChat + storyConnection). Do not drop coverage.

Updated cutover audit (add to TASKS §C): `grep -rn "tool-ui/tokens.css\|@conciv/tool-ui" packages apps | grep -v node_modules | grep -v /dist/` → zero; `--pw-*` tokens still resolve in the running widget (visual check); `builtinToolCards` is assembled in `mount.tsx` from ui-kit-chat generics + widget page/ui entries.

## 19. Test policy — green before, green after, every deletion accounted for

- **Pre-flight (before any code):** run the FULL suite from the worktree and record a baseline —
  every package's tests/ITs + Storybook builds GREEN. If anything is red at baseline, STOP and
  report; do not start on a broken tree.
- **At the end:** the SAME baseline suite + all new ui-kit-chat stories/ITs are GREEN. Net test
  coverage must not drop.
- **No test deleted** unless the thing it tested no longer exists (e.g. `tool-ui` stories are
  MOVED to ui-kit-chat, not deleted; `chat-panel` behavior ITs are PORTED to the new components).
- **Deletion ledger:** maintain a section in TASKS.md listing every removed/renamed test file with
  a one-line justification and where its coverage now lives. A test may be removed ONLY with a
  ledger entry; an unexplained deletion fails the gate.

## 19.1 Test inventory — what to KEEP GREEN, PORT, and UPDATE (no silent loss)

Captured from a full repo sweep. Every item here is accounted for in the TASKS deletion ledger.

**PORT (move, do not delete) — tool-ui tests/stories → ui-kit-chat:**

- `packages/tool-ui/test/util.test.ts`, `packages/tool-ui/test/now-title.test.ts` → ui-kit-chat (util/now-title move there).
- `packages/tool-ui/src/**/*.stories.tsx` (now-line, tool-call, thinking, shell, done-card, + all 8 cards) → ui-kit-chat stories (real useChat + storyConnection).

**UPDATE deliberately (redesign changes them — regenerate, justify in ledger, never blind-delete):**

- `packages/widget/test/style-regression.test.ts` + `packages/widget/test/__snapshots__/computed-styles.json` + `__snapshots__/shots/` — the chat redesign changes computed styles/screenshots; regenerate snapshots and eyeball the diff. A snapshot change is expected; a snapshot _deletion_ needs a ledger entry.

**MUST STAY GREEN post-cutover (cross-cutting; re-run at the final gate):**

- `packages/widget/test/`: `widget.it.test.ts`, `page-mirror.test.ts`, `effect-highlight.it.test.ts`, `react-verbs.it.test.ts`, `widget-settings.test.ts`, `extension-client.browser.test.tsx`, `extension.browser.test.tsx`, `test-runner-card.browser.test.tsx`, `dehydrate.test.ts`, `style-regression.test.ts` (+ fixtures/helpers/snapshots).
- `packages/harness/test/usage-through-chat.test.ts` (end-to-end chat), `packages/plugin/test/widget-inject.it.test.ts`, `packages/protocol/test/chat-types.test.ts` (types stay), `packages/extensions/test-runner/test/test-card.browser.test.tsx` + whiteboard ITs (consumers migrate to ui-kit-chat imports).

**Insulated (verify, no change):** `apps/site`, `apps/examples/tanstack-start` depend only on `@conciv/widget` — no tool-ui ref; confirm they build + the widget renders after cutover.

**Config refs to retarget:** `widget/uno.config.ts` glob `../tool-ui/src` → `../ui-kit-chat/src`; `widget/src/styles.css` `@import` of `@conciv/tool-ui/tokens.css` → the re-homed tokens; `widget/vite.config.ts` js-beautify note travels with page-action. (No turbo.json / pnpm-workspace / storybook-glob refs to tool-ui exist — verified.)
