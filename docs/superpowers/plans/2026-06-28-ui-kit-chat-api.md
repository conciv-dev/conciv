# @mandarax/ui-kit-chat — API spec (Solid, tanstack-native)

Companion to `2026-06-28-widget-chat-ui-redesign.md`. The authoritative interface list to
build against. **Canonical data model = `@tanstack/ai` / `@tanstack/ai-client`** (verbatim
below); we adopt assistant-ui's component _shape_ (compound parts) but bind everything to
tanstack concepts. **No new domain types** — `UIMessage`/`MessagePart` and friends are the
source of truth. Anything assistant-ui has that tanstack does not is listed in §7 (out of
scope) with the reason. This doc has no unknowns and no open questions.

Status: spec / finalized 2026-06-28. tanstack: `ai@0.28.0`, `ai-client@0.16.3`,
`ai-solid@0.13.4`.

## 0. Conventions (Solid)

```ts
import type {JSX, Component, ParentProps, ValidComponent, Accessor} from 'solid-js'
type Slottable = {as?: ValidComponent} // our slot escape hatch (no Ark)
type DivProps = JSX.HTMLAttributes<HTMLDivElement> & Slottable
type SpanProps = JSX.HTMLAttributes<HTMLSpanElement> & Slottable
type FormProps = JSX.HTMLAttributes<HTMLFormElement> & Slottable
type ImgProps = JSX.ImgHTMLAttributes<HTMLImageElement> & Slottable
type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & Slottable
// Action buttons: button props + the behavior-hook's option bag; auto-disabled when the
// hook returns no handler (disabled = props.disabled || !onClick), type="button".
type ActionButtonProps<TArgs = {}> = ButtonProps & TArgs
// React→Solid: ComponentType<P>→Component<P>; ReactNode→JSX.Element; render-prop value is an
// Accessor so it stays reactive. Data-attribute contracts preserved: data-copied, data-floating,
// data-dragging, data-active/aria-current, data-state, role="alert".
```

## 1. Canonical data model — tanstack (verbatim, the ONLY message/part types)

```ts
// @tanstack/ai-client types.d.ts
interface UIMessage<TTools = any, TData = unknown> {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: Array<MessagePart<TTools, TData>>
  createdAt?: Date
}
type MessagePart<TTools = any, TData = unknown> =
  | TextPart
  | ImagePart
  | AudioPart
  | VideoPart
  | DocumentPart
  | ToolCallPart<TTools>
  | ToolResultPart
  | ThinkingPart
  | StructuredOutputPart<TData>

interface TextPart {
  type: 'text'
  content: string
}
interface ThinkingPart {
  type: 'thinking'
  content: string
} // ← reasoning/chain-of-thought
interface ToolResultPart {
  type: 'tool-result'
  toolCallId: string
  content: string | Array<ContentPart>
  state: ToolResultState
  error?: string
}
type ToolCallPart<TTools = any> = {
  // discriminated by `name`
  type: 'tool-call'
  id: string
  name: string
  arguments: string
  input?: InferToolInput<T> // typed when tools are typed; reads via parseInput(part.arguments)
  state: ToolCallState
  approval?: {id: string; needsApproval: boolean; approved?: boolean}
  output?: InferToolOutput<T>
}
type ToolCallState =
  | 'awaiting-input'
  | 'input-streaming'
  | 'input-complete'
  | 'approval-requested'
  | 'approval-responded'
  | 'complete'
type ToolResultState = 'streaming' | 'complete' | 'error'
type ChatClientState = 'ready' | 'submitted' | 'streaming' | 'error' // the chat status

// @tanstack/ai client.d.ts — content parts (multimodal)
type ContentPartSource = ContentPartDataSource | ContentPartUrlSource
interface ImagePart {
  type: 'image'
  source: ContentPartSource
  metadata?: unknown
}
interface AudioPart {
  type: 'audio'
  source: ContentPartSource
  metadata?: unknown
}
interface VideoPart {
  type: 'video'
  source: ContentPartSource
  metadata?: unknown
}
interface DocumentPart {
  type: 'document'
  source: ContentPartSource
  metadata?: unknown
}
type ContentPart = TextPart | ImagePart | AudioPart | VideoPart | DocumentPart
interface StructuredOutputPart<TData = unknown> {
  // ← generative / structured output
  type: 'structured-output'
  status: 'streaming' | 'complete' | 'error'
  partial?: DeepPartial<TData>
  data?: TData
}

interface MultimodalContent {
  content: string | Array<ContentPart>
  id?: string
}
// useChat return (ai-solid) — the runtime, single source of truth (see §6)
interface UseChatReturn {
  messages: Accessor<UIMessage[]>
  status: Accessor<ChatClientState>
  isLoading: Accessor<boolean>
  error: Accessor<Error | undefined>
  sendMessage: (c: string | MultimodalContent) => Promise<void>
  append: (m: ModelMessage | UIMessage) => Promise<void>
  reload: () => Promise<void>
  stop: () => void
  setMessages: (m: UIMessage[]) => void
  clear: () => void
  addToolResult: (r: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => Promise<void>
  addToolApprovalResponse: (r: {id: string; approved: boolean}) => Promise<void>
}
```

### 1.1 assistant-ui concept → tanstack mapping (how we re-bind)

| assistant-ui                                         | tanstack (what we use)                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ThreadMessage`                                      | `UIMessage`                                                                                                                             |
| `MessageRole`                                        | `UIMessage['role']`                                                                                                                     |
| `PartState` / `MessagePart`                          | `MessagePart` (tanstack)                                                                                                                |
| `TextMessagePart`                                    | `TextPart`                                                                                                                              |
| `ReasoningMessagePart`                               | `ThinkingPart`                                                                                                                          |
| `ToolCallMessagePart` (args+result+approval bundled) | `ToolCallPart` **+** paired `ToolResultPart` (by `toolCallId`; pair via the existing `pairResults`, `chat-panel.tsx:41`)                |
| tool `approval` + `respondToApproval`                | `ToolCallPart.approval` + `chat.addToolApprovalResponse({id,approved})` (+ our `client.permissionDecision`, [[native-approval-hybrid]]) |
| `ImageMessagePart`/`FileMessagePart`/audio           | `ImagePart` / `DocumentPart` / `AudioPart`                                                                                              |
| `DataMessagePart` / `GenerativeUIMessagePart`        | `StructuredOutputPart`, and our `GenUi` over `MANDARAX_UI_EVENT` custom events (`@mandarax/protocol/ui-types`)                          |
| `MessageStatus` (per message)                        | derived from parts + `ChatClientState` (no per-message status type)                                                                     |
| `MessagePartStatus`                                  | `ToolCallState` / `ToolResultState` / `StructuredOutputPart.status`                                                                     |
| `SuggestionState`                                    | our starter shape `{ title; label; prompt }` (UI prop data, not a domain type)                                                          |
| `ThreadListItemState`                                | our `ChatSessionMeta` (`@mandarax/protocol/chat-types`) via the session store                                                           |
| `ComposerState`                                      | derived view (§6) over `useChat` + local draft signal                                                                                   |

## 2. Headless primitive props (Solid, tanstack-bound)

Tool render component — **reuse the existing types, do not invent new ones**
([[tool-ui-tanstack-convention]], [[no-tool-registry-self-describe]]). Import `ToolCardProps`
and `ToolCardEntry` from `@mandarax/protocol` (the live contract used by `chat-panel.tsx`):

```ts
// existing — do NOT redefine:
type ToolCardProps = {part: ToolCallPart; result: ToolResultPart | undefined; ctx: ToolViewCtx; durationMs?: number}
type ToolUIComponent = Component<ToolCardProps>
type ToolCardEntry = {names: string[]; render: ToolUIComponent; streamTitle?: string} // self-describing
// Dispatch is by an ARRAY of self-describing entries matched by name — NOT a name→component
// dict/registry. defineToolkit (§5.4) returns ToolCardEntry[]; the widget passes it as a prop.
```

### 2.1 Thread — `primitives/thread/`

```ts
namespace Thread {
  type Root = DivProps
  type Viewport = DivProps & {
    autoScroll?: boolean // default false when turnAnchor='top', else true
    turnAnchor?: 'top' | 'bottom' // default 'bottom'
    topAnchorMessageClamp?: {tallerThan?: string; visibleHeight?: string} // {'10em','6em'}
    scrollToBottomOnRunStart?: boolean
    scrollToBottomOnInitialize?: boolean
    scrollToBottomOnThreadSwitch?: boolean
  }
  type ViewportFooter = DivProps
  type MessagesComponents = {UserMessage?: Component; AssistantMessage?: Component; SystemMessage?: Component}
  type Messages =
    | {components: MessagesComponents; children?: never}
    | {children: (m: Accessor<UIMessage>) => JSX.Element; components?: never}
  type MessageByIndex = {index: number; components: MessagesComponents}
  type ScrollToBottom = ActionButtonProps<{behavior?: ScrollBehavior}>
  type Suggestion = ActionButtonProps<{prompt: string; send?: boolean; clearComposer?: boolean}>
  type Suggestions =
    | {components: {Suggestion: Component}; children?: never}
    | {children: (s: Accessor<Suggestion>) => JSX.Element; components?: never}
  type Empty = ParentProps // renders children only when thread is empty
  type If = ParentProps<RequireAtLeastOne<{empty?: boolean; running?: boolean; disabled?: boolean}>>
}
type Suggestion = {title: string; label: string; prompt: string}
```

### 2.2 Message — `primitives/message/`

```ts
namespace Message {
  type Root = DivProps
  type PartsComponents = {
    Text?: Component<{part: TextPart}>
    Thinking?: Component<{part: ThinkingPart}> // reasoning
    Image?: Component<{part: ImagePart}>
    Audio?: Component<{part: AudioPart}>
    Video?: Component<{part: VideoPart}>
    Document?: Component<{part: DocumentPart}>
    StructuredOutput?: Component<{part: StructuredOutputPart}>
    tools?: {entries?: ToolCardEntry[]; Fallback?: ToolUIComponent} | {Override: ToolUIComponent} // array, matched by name (no dict)
    Empty?: Component
  }
  type Parts =
    | {components?: PartsComponents; children?: never}
    | {children: (p: Accessor<MessagePart>) => JSX.Element; components?: never}
  type PartByIndex = {index: number; components: PartsComponents}
  type Attachments = {components: {Image?: Component; Document?: Component; File?: Component; Attachment?: Component}} // attachments shown on a sent user message
  type If = ParentProps<
    RequireAtLeastOne<{
      user?: boolean
      assistant?: boolean
      system?: boolean
      hasContent?: boolean
      copied?: boolean
      last?: boolean
      lastOrHover?: boolean
      hasAttachments?: boolean
      submittedFeedback?: 'positive' | 'negative' | null
    }>
  >
  type Error = ParentProps // renders chat.error(); mount only on the last assistant message
}
```

Tool-call ↔ tool-result pairing is internal: `Message.Parts` pairs each `ToolCallPart` with
its sibling `ToolResultPart` (by `toolCallId`) and passes both to the tool component;
the standalone result part is then skipped (existing `pairResults`/`hiddenResultIds`).

### 2.3 MessagePart — `primitives/message-part/`

```ts
namespace MessagePart {
  type Text = Omit<SpanProps, 'children'> & {streaming?: boolean; component?: ValidComponent} // streaming reveal via solid-streamdown (no SmoothOptions)
  type Image = ImgProps
  type InProgress = ParentProps // renders while the owning part is non-terminal
}
```

### 2.4 Composer — `primitives/composer/`

```ts
namespace Composer {
  type Root = FormProps // onSubmit → send()
  type Input = AutosizeTextareaProps & {
    // AutosizeTextareaProps defined in §5.1
    cancelOnEscape?: boolean // default true
    submitMode?: 'enter' | 'ctrlEnter' | 'none' // default 'enter'
    focusOnRunStart?: boolean
    focusOnThreadSwitched?: boolean
    addAttachmentOnPaste?: boolean
  }
  type Send = ActionButtonProps
  type Cancel = ActionButtonProps
  type AddAttachment = ActionButtonProps<{multiple?: boolean}>
  type Attachments =
    | {
        components: {Image?: Component; Document?: Component; File?: Component; Attachment?: Component}
        children?: never
      }
    | {children: (a: Accessor<AttachmentDraft>) => JSX.Element; components?: never}
  type AttachmentDropzone = DivProps & {disabled?: boolean} // data-dragging
  type If = ParentProps<RequireAtLeastOne<{editing?: boolean; dictation?: boolean}>> // (matches assistant-ui ComposerIf — NOT hasAttachments)
  type Quote = DivProps
  type QuoteText = SpanProps
  type QuoteDismiss = ButtonProps // quote a selection into the draft (composer-local)
  type Dictate = ActionButtonProps
  type StopDictation = ActionButtonProps
  type DictationTranscript = SpanProps // gated: null unless a dictation handler is provided
  // Unstable_TriggerPopover* (@/slash menu): built headless; the @/slash adapter is supplied by
  // the widget's composer-controls/extension-slots. See assistant-ui composer/trigger/* for the
  // 7-part shape (Root, Popover, Categories, CategoryItem, Items, Item, Back) when implementing.
}
// Attachments are tanstack ContentParts staged for the next sendMessage(MultimodalContent):
type AttachmentDraft = {id: string; name: string; part: Exclude<ContentPart, TextPart>}
```

### 2.5 ActionBar — `primitives/action-bar/`

```ts
namespace ActionBar {
  type Root = DivProps & {
    hideWhenRunning?: boolean // default false
    autohide?: 'always' | 'not-last' | 'never' // default 'never'
    autohideFloat?: 'always' | 'never'
  } // default 'never'; sets data-floating
  type Copy = ActionButtonProps<{copiedDuration?: number}> // default 3000; copies the message's text parts; data-copied
  type Reload = ActionButtonProps // chat.reload(); disabled while running
  type Edit = ActionButtonProps // enter edit mode → on save setMessages(truncate-after) + reload()
  type ExportMarkdown = ActionButtonProps<{filename?: string; onExport?: (md: string) => void}> // client-side serialize
  type Speak = ActionButtonProps
  type StopSpeaking = ActionButtonProps // gated: null unless a TTS handler is provided
  type FeedbackPositive = ActionButtonProps
  type FeedbackNegative = ActionButtonProps // gated: null unless a feedback handler is provided
}
// Capability gating (assistant-ui convention): each button renders null when the runtime
// provides no handler. Copy/Reload/ExportMarkdown always available; Edit available once the
// edit-composer is wired; Speak/Feedback only when the widget passes a handler. Build them all.
```

### 2.6 ActionBarMore — `primitives/action-bar-more/` (→ ui-kit `Menu`)

```ts
namespace ActionBarMore {
  // Solid-backed by ui-kit-system Menu (Ark)
  type Root = MenuRootProps
  type Trigger = ButtonProps
  type Content = DivProps & {portalProps?: PortalProps} // sideOffset 4, portalled
  type Item = ButtonProps & {onSelect?: () => void; disabled?: boolean}
  type Separator = DivProps
}
```

### 2.7 ChainOfThought — `primitives/chain-of-thought/`

```ts
namespace ChainOfThought {
  type Root = DivProps
  type AccordionTrigger = ActionButtonProps // toggles collapsed (view-state, §6)
  type Parts =
    | {
        components?: {
          Thinking?: Component<{part: ThinkingPart}>
          tools?: {Fallback?: ToolUIComponent}
          Layout?: Component<ParentProps>
        }
        children?: never
      }
    | {children: (p: Accessor<MessagePart>) => JSX.Element; components?: never}
}
// "Chain" = the consecutive thinking + tool parts grouped by groupSegments (§5.2).
```

### 2.8 Suggestion — `primitives/suggestion/`

```ts
namespace Suggestion {
  type Title = SpanProps
  type Description = SpanProps // children ?? suggestion.title / .label
  type Trigger = ActionButtonProps<{send?: boolean; clearComposer?: boolean}> // clearComposer default true
}
```

### 2.9 Error — `primitives/error/`

```ts
namespace Error {
  type Root = DivProps /* role=alert */
  type Message = SpanProps /* children ?? String(chat.error()) */
}
```

### 2.10 ThreadList / ThreadListItem — `primitives/thread-list*/` (backed by our session store)

```ts
// State = our ChatSessionMeta (@mandarax/protocol/chat-types). Actions = the existing session
// store (session-store-client.ts): sessions(), loadSessions, invalidateSessions, applyTitle,
// + api-client resolve()/rename(). NOT tanstack (tanstack has no thread list).
namespace ThreadList {
  type Root = DivProps
  type New = ActionButtonProps
  type LoadMore = ActionButtonProps
  type Items = {archived?: boolean} & (
    | {components: {ThreadListItem: Component}; children?: never}
    | {children: (s: Accessor<ChatSessionMeta>) => JSX.Element; components?: never}
  )
}
namespace ThreadListItem {
  type Root = DivProps // data-active/aria-current for the active session
  type Trigger = ActionButtonProps // resolve()+activate
  type Title = {fallback?: JSX.Element}
  type Archive = ActionButtonProps
  type Unarchive = ActionButtonProps
  type Delete = ActionButtonProps // gated on session-store support
}
namespace ThreadListItemMore {
  // per-row overflow menu → ui-kit Menu (mirrors ActionBarMore)
  type Root = MenuRootProps
  type Trigger = ButtonProps
  type Content = DivProps & {portalProps?: PortalProps}
  type Item = ButtonProps & {onSelect?: () => void; disabled?: boolean}
  type Separator = DivProps
}
```

### 2.10b Attachment — `primitives/attachment/` (standalone chip, used by Composer + Message)

```ts
namespace Attachment {
  type Root = DivProps
  type Name = SpanProps // renders the attachment name
  type Remove = ActionButtonProps // removes from the composer draft (composer context only)
  type Thumb = DivProps // renders the file extension badge (assistant-ui unstable_Thumb)
}
```

### 2.11 AssistantModal — `primitives/assistant-modal/` (→ ui-kit `Popover`)

```ts
namespace AssistantModal {
  // the FAB + popover shell (replaces shell/popover.tsx floating-ui)
  type Root = PopoverRootProps & {openOnRunStart?: boolean} // default true
  type Trigger = ButtonProps
  type Content = PopoverContentProps & {portalProps?: PortalProps; dismissOnInteractOutside?: boolean} // default false; side 'top', align 'end'
  type Anchor = DivProps
}
```

### 2.12 BranchPicker — `primitives/branch-picker/` (built, currently inert)

```ts
namespace BranchPicker {
  type Root = DivProps & {hideWhenSingleBranch?: boolean} // default false
  type Previous = ActionButtonProps
  type Next = ActionButtonProps
  type Count = {}
  type Number = {}
}
// tanstack UIMessage has NO sibling/branch model, so branchCount is always 1 today → with
// hideWhenSingleBranch it renders nothing. Ships for API parity; lights up only if/when a
// branch layer is added (store a sibling map in view-state + switch via setMessages). The
// branch layer is the ONE genuinely-deferred feature (§7).
```

### 2.13 QueueItem / SelectionToolbar — `primitives/*/` (built, widget-optional)

```ts
namespace QueueItem {
  type Text = SpanProps
  type Steer = ActionButtonProps
  type Remove = ActionButtonProps
}
// Queue is widget-owned (a local pending-message list); primitives gated on a queue handler.
namespace SelectionToolbar {
  type Root = DivProps // portals; renders on a valid in-message text selection
  type Quote = ButtonProps // quote selection into the composer draft
}
function useSelectionToolbarInfo(): Accessor<{text: string; messageId: string; rect: DOMRect} | null>
```

## 3. Behaviors (Phase 3) — `behaviors/`

```ts
function useThreadAutoScroll(
  viewport: Accessor<HTMLElement | undefined>,
  opts: {autoScroll: Accessor<boolean>},
): {isAtBottom: Accessor<boolean>; scrollToBottom: (b?: ScrollBehavior) => void}
function useTopAnchorReserve(args: {
  viewport: Accessor<HTMLElement | undefined>
  anchorEl: Accessor<HTMLElement | undefined>
  targetEl: Accessor<HTMLElement | undefined>
  clamp: {tallerThan: number; visibleHeight: number}
}): void
function useScrollLock<T extends HTMLElement>(el: Accessor<T | undefined>, animationDurationMs: number): () => void
function useSizeHandle(
  el: Accessor<HTMLElement | undefined>,
  onResize: (size: {width: number; height: number}) => void,
): void
```

**Top-anchor ↔ stick-to-bottom handoff (one coordinator, no conflict).** A single
`useThreadScroll(viewport, { turnAnchor })` owns the state machine and the others are its
internals: on run-start with `turnAnchor==='top'` it enters **top-anchored** (pin the new
user turn to the top via `useTopAnchorReserve`, autoscroll OFF); once the streaming
assistant content below exceeds the reserved slack (target overflows the viewport) it
**releases to bottom-follow** (`useThreadAutoScroll`, autoscroll ON) so the answer stays in
view; a user scroll-up cancels follow; `topAnchorTurn` clears on run-finish. `Viewport`'s
`autoScroll` default (`false` when `turnAnchor==='top'`) is the _initial_ state only — the
coordinator flips it on release. This is the D10 contract; storybook it with tall mock
content + a `storyConnection({ chunks, chunkDelay })` driving the real useChat (§6.1).

## 4. Styled layer props (Phase 4) — neutral/themeable

```ts
type ThreadComponents = {
  AssistantMessage?: Component
  Welcome?: Component
  ToolFallback?: ToolUIComponent
  ToolGroup?: Component<ParentProps<{indices: number[]}>>
  ThinkingGroup?: Component<ParentProps<{indices: number[]}>>
}
type ThreadProps = {components?: ThreadComponents}
type TooltipIconButtonProps = ButtonProps & {tooltip: string; side?: 'top' | 'bottom' | 'left' | 'right'}
// Collapsible-rooted styled cards (over ui-kit Collapsible):
type CollapsibleCardProps = {open?: boolean; onOpenChange?: (o: boolean) => void; defaultOpen?: boolean; class?: string}
type ToolFallbackProps = CollapsibleCardProps // body renders argsText + result as styled <pre> (§7: no JsonTreeView)
type ToolGroupProps = CollapsibleCardProps & {variant?: 'outline' | 'ghost' | 'muted'}
type ReasoningProps = CollapsibleCardProps & {variant?: 'outline' | 'ghost' | 'muted'; streaming?: boolean}
type MarkdownProps = {content: string; streaming?: boolean} // solid-streamdown binding
```

## 5. Filled deep types (no remaining unknowns)

### 5.1 AutosizeTextareaProps (replaces react-textarea-autosize)

```ts
type AutosizeTextareaProps = Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> & {
  minRows?: number // default 1
  maxRows?: number // default ~5 (the existing 120px cap, chat-panel.tsx:597)
  onHeightChange?: (height: number) => void
}
// Implementation: the existing autoGrow (set height='auto' then min(scrollHeight, maxPx)).
```

### 5.2 Grouping types (ours — replaces assistant-ui GroupByContext/EnrichedPartState)

```ts
// Ported verbatim from chat-panel.tsx:192-270 — the canonical grouping over tanstack parts.
type Turn = {key: string; role: UIMessage['role']; parts: MessagePart[]; start: number; end: number}
function coalesceTurns(messages: readonly UIMessage[]): Turn[] // merge consecutive assistant messages
type ChainSegment = {kind: 'chain'; indices: number[]} // consecutive thinking + tool parts
type ReplySegment = {kind: 'reply'; index: number} // a non-empty text part
type Segment = ChainSegment | ReplySegment
function groupSegments(parts: readonly MessagePart[]): Segment[]
type ResultPairing = {byCallId: Map<string, ToolResultPart>; hiddenResultIds: Set<string>}
function pairResults(parts: readonly MessagePart[]): ResultPairing
```

### 5.3 Capabilities (replaces assistant-ui RuntimeCapabilities)

```ts
// tanstack supports reload + stop universally; no edit/branch/queue. So capability is trivial:
type Capabilities = {reload: true; stop: true} // ActionBar.Reload always enabled while not running
```

### 5.4 Toolkit + approval (tanstack/our terms — replaces opencode SDK types)

```ts
// Array of self-describing entries (NOT a name→component dict — [[no-tool-registry-self-describe]]).
function defineToolkit(...entries: ToolCardEntry[]): ToolCardEntry[] // identity helper for typing
// dispatch: find the entry whose names[] includes part.name, else the generic fallback card.
// Approval (PermissionCard) — binds to ToolCallPart.approval, NOT opencode:
type PermissionCardProps = {part: ToolCallPart; onDecision: (approved: boolean) => void}
//   onDecision → chat.addToolApprovalResponse({ id: part.approval!.id, approved })
//             and client.permissionDecision({ approvalId, approved })  ([[native-approval-hybrid]])
// "Question"/ask UI = our existing GenUi over MANDARAX_UI_EVENT (UiSpec, @mandarax/protocol/ui-types) — see gen-ui.tsx.
```

with-opencode tool components we port (all `ToolUIComponent`, bound to `{part,result}`):
`ApplyPatchDiff` (Claude v2-patch→unified diff via `@mandarax/solid-diffs`), `BashCard`
(stdout/stderr/exit), `InlineTool`/`ToolCallShell` (one-line read/grep/glob/web rows +
generic fallback). The patch-parse functions are plain code — lift verbatim.

## 6. Store / context (Phase 1) — `store/`

```ts
type ViewState = {
  draft: string // composer draft — owned UI state (useChat has no draft)
  collapsed: Record<string, boolean> // keyed by toolCallId (NOT part index — survives streaming id churn)
  pinned: Record<string, boolean> // chain-of-thought, keyed by messageId
  hovering: string | null // messageId
  viewport: {
    isAtBottom: boolean
    turnAnchor: 'top' | 'bottom'
    topAnchorTurn: {anchorId: string; targetId: string} | null
  }
}
// view-state keys are GC'd when they no longer match any message/toolCallId in chat.messages().

type ChatContextValue = UseChatReturn & {view: ViewState}
function ChatProvider(props: ParentProps<{chat: UseChatReturn}>): JSX.Element
function useChatContext(): ChatContextValue
// derived views (createMemo over chat.messages()/status() — NO copied state, no new domain types):
function useThread(): {isEmpty: boolean; isRunning: boolean; isDisabled: boolean; turns: Turn[]} // isRunning := status()==='streaming'||'submitted'
function useComposer(): {
  text: Accessor<string>
  setText: (t: string) => void
  isEmpty: Accessor<boolean>
  canSend: Accessor<boolean>
  canCancel: Accessor<boolean>
  send: () => void
  cancel: () => void
}
```

### 6.1 Storybook seam — REAL `useChat` + a fake CONNECTION ADAPTER (NO mocks)

This is exactly how TanStack tests `useChat` itself (`ai-solid/tests/use-chat.test.ts` +
`ai-client/tests/test-utils.ts`): build a fake `ConnectionAdapter` whose `connect()` async-
generator yields canned AG-UI `StreamChunk`s, hand it to the **real** `useChat`, then drive
it with `sendMessage`. The real stream processor / state machine / part assembly run offline.
We replicate their `createMockConnectionAdapter` (it lives in `tests/`, not published) as a
Storybook helper `storyConnection`:

```ts
// mirrors ai-client/tests/test-utils.ts createMockConnectionAdapter
interface StoryConnectionOptions {
  chunks?: StreamChunk[] // AG-UI events: TEXT_MESSAGE_CONTENT, TOOL_CALL_START/ARGS/RESULT, RUN_FINISHED, ...
  chunkDelay?: number // ms between chunks → simulates streaming (submitted→streaming→ready)
  shouldError?: boolean
  error?: Error // → error state
}
function storyConnection(o?: StoryConnectionOptions): ConnectionAdapter // { async *connect(messages, data, abortSignal) { yield* chunks } }
// chunk builders (copied from test-utils): createTextChunks(text), createToolCallChunks(name, args, result), + an approval-chunk builder
```

Story usage — the real hook, wrapped exactly like the widget:

```tsx
function Story() {
  const chat = useChat({connection: storyConnection({chunks: createTextChunks('Hello'), chunkDelay: 20})})
  return (
    <ChatProvider chat={chat}>
      <Thread />
    </ChatProvider>
  )
}
```

Static frames: `useChat({ connection: storyConnection(), initialMessages: [...] })`.
Transitions/behaviors (streaming, approval resume via the real `addToolApprovalResponse`,
error, top-anchor scroll on a tall thread) are driven by `sendMessage` in a play() function.
**No mocks of `useChat`/`UseChatReturn`, no server, no app** — only a fake transport, the
same seam TanStack's own tests use.

## 7. Capability model — what's built vs gated vs deferred

**We build the FULL primitive API (assistant-ui parity).** Following assistant-ui's own
convention, each action primitive renders `null` when the runtime provides no handler — so
shipping everything is cheap and the widget lights up only what it supports. Nothing below
is deleted; the table says _when each becomes live_.

| Capability                                       | Status                                   | Detail                                                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy, Reload, ExportMarkdown                     | **live now**                             | pure client-side over `useChat` (copy text parts; `chat.reload()`; serialize markdown).                                                                                                                           |
| ActionBar.Edit                                   | **built; live once edit-composer wired** | edit a user msg → `setMessages(truncate-after)` + `reload()`. Phase 6 wires it.                                                                                                                                   |
| Composer Quote / QuoteDismiss / SelectionToolbar | **built; composer-local**                | quote selected text into the draft; no backend needed.                                                                                                                                                            |
| Composer Dictate / Speak / Feedback              | **built; gated (null until handler)**    | widget passes a TTS / feedback handler when one exists; absent → not rendered.                                                                                                                                    |
| Composer Unstable_TriggerPopover (@/slash)       | **built; adapter from widget**           | the @/slash item adapter comes from composer-controls/extension-slots.                                                                                                                                            |
| QueueItem                                        | **built; gated**                         | widget owns a local pending-message queue; primitives gate on its handlers.                                                                                                                                       |
| **BranchPicker**                                 | **built; INERT (the one real gap)**      | `UIMessage` has no sibling/branch model → `branchCount===1` → renders nothing. Goes live only if we add a branch layer (sibling map in view-state + `setMessages` switch). The single genuinely-deferred feature. |
| StructuredOutput part                            | **live**                                 | tanstack `StructuredOutputPart`.                                                                                                                                                                                  |
| Generative UI (`MANDARAX_UI_EVENT` `GenUi`)      | **live**                                 | rendered out-of-band via custom events, not a message part.                                                                                                                                                       |
| Source message part                              | **n/a (no data)**                        | our agent emits no `source` parts; the `Source` slot exists but is never populated.                                                                                                                               |
| JsonTreeView                                     | **not built**                            | args/results render as styled `<pre>` (parity); revisit only if `<pre>` proves insufficient.                                                                                                                      |

## 8. Source map

assistant-ui (reference only, NOT a dep) at `/Users/dev/Public/web/assistant-ui` @
`523e0b563`: headless `packages/react/src/primitives/*`, styled `packages/ui/src/components/
assistant-ui/*`, tool vocabulary `examples/with-opencode/components/tools/*`. tanstack types:
`@tanstack/ai-client@0.16.3` `dist/esm/types.d.ts`, `@tanstack/ai@0.28.0` `dist/esm/client.d.ts`,
`@tanstack/ai-solid@0.13.4` `dist/types.d.ts`. Existing widget grouping/pairing logic:
`packages/widget/src/chat/chat-panel.tsx:41-270`.

---

## Appendix A — ModelSelector (assistant-ui API parity) — added 2026-06-29

**Gap.** assistant-ui ships ModelSelector in `packages/ui/src/components/assistant-ui/model-selector.tsx`
(a styled compound, NOT a headless `packages/react` primitive). The widget already has its own
ad-hoc version (`packages/widget/src/composer/model-selector.tsx`, Ark Combobox). When the original
§2 list was drawn it was scoped from the headless `packages/react` primitives only, so the
model-selector — being a `packages/ui` styled component — was never enumerated. The §7 promise is
"assistant-ui parity"; the cutover (TASKS §6d, "model/session selectors into ui-kit-chat Composer
slots") needs it. **This appendix closes the gap: port it with the EXACT assistant-ui public API.**

**Two-layer placement (the package standard, primitive + styled):**

- `primitives/model-selector/model-selector.tsx` — headless compound. NO classes; icons supplied by
  the caller as children (assistant-ui's hardcoded `ChevronDownIcon`/`CheckIcon` move to the styled
  layer). Owns state + structure. Built on ui-kit-system base components only.
- `styled/model-selector.tsx` — the styled compound + the flat convenience `ModelSelector`. Applies
  `--chat-*` tokens + lucide `ChevronsUpDown`/`Check`; mirrors the widget's pill visual.

### A.1 Public API — verbatim assistant-ui, Solid-translated (the contract)

```ts
// Types — identical to assistant-ui (icon?: ReactNode → JSX.Element). NOTE: NO `group` field;
// grouping is consumer-composed via <ModelSelector.Group> (the widget maps its `group` field at
// cutover), exactly like assistant-ui.
type ModelSelectorEffortOption = {id: string; name: string}
const DEFAULT_EFFORT_OPTIONS: readonly ModelSelectorEffortOption[] // [low, medium, high]
type ModelOption = {
  id: string
  name: string
  description?: string
  icon?: JSX.Element
  disabled?: boolean
  keywords?: readonly string[] // extra terms matched by Search, beyond id+name
  efforts?: boolean | readonly ModelSelectorEffortOption[] // true → DEFAULT_EFFORT_OPTIONS
}

// Compound parts — same names + same semantics as assistant-ui:
namespace ModelSelector {
  type Root = ParentProps<{
    models: readonly ModelOption[]
    value?: string
    defaultValue?: string
    onValueChange?: (value: string) => void
    effort?: string
    defaultEffort?: string
    onEffortChange?: (effort: string) => void
    open?: boolean
    defaultOpen?: boolean
    onOpenChange?: (open: boolean) => void
  }> // controllable value/effort/open; defaultValue falls back to models[0]?.id (assistant-ui parity)
  type Trigger = ButtonProps & {variant?: 'outline' | 'ghost' | 'muted'; size?: 'default' | 'sm' | 'lg'}
  type Value = {placeholder?: JSX.Element; showEffort?: boolean; class?: string} // selectedModel name (+ effort)
  type Content = DivProps & {align?: 'start' | 'center' | 'end'; sideOffset?: number} // default 'start', 6
  type Search = JSX.InputHTMLAttributes<HTMLInputElement> & {placeholder?: string} // default 'Search models...'
  type List = DivProps
  type Empty = ParentProps<DivProps> // default child 'No models found.'
  type Group = ParentProps<DivProps>
  type Separator = DivProps
  type Item = Omit<ButtonProps, 'value'> & {model: ModelOption; onSelect?: (value: string) => void}
  type Effort = DivProps & {label?: JSX.Element} // default 'Thinking'; renders null when no efforts
}

// Flat convenience component (assistant-ui default composition):
type ModelSelectorProps = Omit<ModelSelector.Root, 'children'> & {
  searchable?: boolean
  class?: string
  contentClass?: string
  variant?: 'outline' | 'ghost' | 'muted'
  size?: 'default' | 'sm' | 'lg'
}
function ModelSelector(props: ModelSelectorProps): JSX.Element // = Root>Trigger+Content(Search?,List,Effort)

// Helpers — exact assistant-ui surface:
function resolveModelEffort(
  models: readonly ModelOption[],
  modelId: string | undefined,
  effort: string | undefined,
): string | undefined
function useModelSelectorEfforts(): {
  efforts?: readonly ModelSelectorEffortOption[]
  effort?: string
  setEffort: (e: string) => void
}
```

### A.2 Implementation mapping (assistant-ui React → our ui-kit-system)

| assistant-ui (React)                                             | ui-kit-chat (Solid)                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Popover` + cmdk `Command`                                       | ui-kit-system **Combobox** (Ark) — the search/filter/keyboard-nav list, as the widget already proved (`useListCollection` + `filter`).                                                                                                                                          |
| `PopoverTrigger` (button)                                        | `Combobox.Control` + `Combobox.Trigger` (button pill, `openOnClick`, `role=combobox`).                                                                                                                                                                                          |
| `CommandInput` (optional)                                        | `Combobox.Input` inside Content — rendered only when `Search` is composed (non-searchable omits it; list stays arrow-key navigable). Drive it as a PURE search box (`selectionBehavior:'clear'`, reset on open) so it never echoes the selected model — the widget's exact fix. |
| `CommandItem` `keywords`/`onSelect`                              | `Combobox.Item` + `useListCollection` filter over `name`/`id`/`keywords`; pick → `setValue` + close.                                                                                                                                                                            |
| `CommandGroup`/`CommandSeparator`                                | `Combobox.ItemGroup` / a styled divider `<div>`.                                                                                                                                                                                                                                |
| `CommandEmpty`                                                   | `<Show when={collection().items.length === 0}>`.                                                                                                                                                                                                                                |
| `useControllableState` (React)                                   | a small Solid `createControllableSignal({value, defaultValue, onChange})` in `primitives/util/` (prop-controlled vs internal signal; onChange via ref-free accessor).                                                                                                           |
| `ModelSelectorModelContext` (`useAui().modelContext().register`) | **DROPPED** — we have no assistant-ui ModelContext. Selection is purely controlled: `onValueChange` is the only output; the host (widget `modelSelectorControl`) wires it to `setRequestMeta({model})`.                                                                         |

### A.3 Deviations (explicit — the no-silent-deviation rule)

1. **No `useAui` ModelContext registration.** Replaced by controlled `onValueChange` (see mapping).
   Rationale: tanstack/AG-UI ships the model via `forwardedProps`, not an assistant-ui context.
2. **`efforts` is gated/forward-looking.** `HarnessModelInfo` has no `efforts` field today, so
   `ModelSelector.Effort` renders `null` in the live widget (assistant-ui's own `if (!efforts?.length)
return null`). The part + types + helpers are built for parity; lighting it up = add `efforts` to
   `HarnessModelSchema` + emit it from the harness (a future, separate task). Listed in §7 below.
3. **Grouping by `HarnessModelInfo.group`** stays a consumer concern (the widget composes
   `ModelSelector.Group` blocks via its existing `groupsOf`), exactly as assistant-ui leaves grouping
   to the caller. `ModelOption` deliberately omits `group`.
4. **Icons via the styled layer**, not hardcoded in the primitive (the primitive/styled split). Public
   API unchanged.

### A.4 §7 capability row (append to the table)

| Capability                              | Status                                       | Detail                                                                                                                      |
| --------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ModelSelector.Effort (reasoning effort) | **built; gated (null until `efforts` data)** | `HarnessModelInfo` has no `efforts` yet → renders null; parity-complete API. Lights up when the harness advertises efforts. |

### A.5 Verification

- `primitives/model-selector/model-selector.stories.tsx` — REAL state (no mocks): closed/open,
  searchable filter narrows the list, disabled item unselectable, Empty when filter matches nothing,
  Effort row present when a model has `efforts` / absent otherwise, controlled `value` round-trips.
- `styled/model-selector.stories.tsx` — neutral + dark + mandarax themes; the pill matches the widget
  visual; opens in shadow-DOM (EnvironmentProvider) without rendering at 0,0 (Ark+shadow memory).
- Exported from `src/index.tsx`; oxlint clean (Combobox/Popover only from ui-kit-system; Ark hooks
  `useListCollection` allowed, no Ark component subpath).
- Cutover: `packages/widget/src/composer/model-selector.tsx` is rebuilt on `@mandarax/ui-kit-chat`'s
  `ModelSelector` (maps `groupsOf` → `Group` blocks; `onValueChange` → `setRequestMeta({model})`);
  the old hand-rolled Combobox markup is deleted (TASKS §6d).
