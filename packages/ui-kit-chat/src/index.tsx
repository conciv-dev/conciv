// Store / context (the single source of truth = the real tanstack useChat return).
export {
  ChatProvider,
  useChatContext,
  useThread,
  useComposer,
  type ViewState,
  type ChatContextValue,
} from './store/chat-context.js'
export {
  coalesceTurns,
  groupSegments,
  pairResults,
  type Turn,
  type Segment,
  type ChainSegment,
  type ReplySegment,
  type ResultPairing,
} from './store/grouping.js'
export {ToolProvider, useToolCtx} from './store/tool-context.js'

// Utilities.
export {Primitive, type Slottable} from './primitives/util/primitive.js'
export {
  createActionButton,
  type ActionButtonState,
  type ActionButtonProps,
} from './primitives/util/create-action-button.js'

// Headless primitives (assistant-ui convention: `*Primitive` for the headless compound parts).
export {Thread as ThreadPrimitive, type MessagesComponents} from './primitives/thread/thread.js'
export {ViewportProvider, useThreadViewport, type ViewportContextValue} from './primitives/thread/viewport-context.js'
export {Message as MessagePrimitive, type PartsComponents} from './primitives/message/message.js'
export {
  MessageProvider,
  useMessage,
  PartProvider,
  usePart,
  type MessageContextValue,
  type PartContextValue,
} from './primitives/message/message-context.js'
export {
  MessagePart,
  useMessagePartText,
  useMessagePartReasoning,
  useMessagePartImage,
  useMessagePartToolCall,
  useMessagePartFile,
  useMessagePartData,
  useMessagePartSource,
} from './primitives/message-part/message-part.js'
export {Composer as ComposerPrimitive} from './primitives/composer/composer.js'
export {
  ComposerProvider,
  useComposerContext,
  type ComposerContextValue,
  type AttachmentDraft,
  type AttachmentPart,
} from './primitives/composer/composer-context.js'
export {
  ComposerHandlersProvider,
  useComposerHandlers,
  type ComposerHandlers,
  type TriggerItem,
} from './primitives/composer/composer-handlers.js'
export {ActionBar as ActionBarPrimitive, useCopied} from './primitives/action-bar/action-bar.js'
export {
  ActionHandlersProvider,
  useActionHandlers,
  type ActionHandlers,
} from './primitives/action-bar/action-handlers.js'
export {ActionBarMore} from './primitives/action-bar-more/action-bar-more.js'
export {ActionBarMore as ThreadListItemMore} from './primitives/action-bar-more/action-bar-more.js'
export {Attachment, AttachmentProvider, useAttachment} from './primitives/attachment/attachment.js'
export {ChainOfThought as ChainOfThoughtPrimitive} from './primitives/chain-of-thought/chain-of-thought.js'
export {
  BranchPicker as BranchPickerPrimitive,
  BranchProvider,
  useBranch,
  type BranchState,
} from './primitives/branch-picker/branch-picker.js'
export {Suggestion, SuggestionProvider, useSuggestion, type SuggestionData} from './primitives/suggestion/suggestion.js'
export {Error as ErrorPrimitive} from './primitives/error/error.js'
export {ThreadList, ThreadListItem} from './primitives/thread-list/thread-list.js'
export {
  ThreadListProvider,
  useThreadList,
  ThreadListItemProvider,
  useThreadListItem,
  type ThreadListActions,
} from './primitives/thread-list/thread-list-context.js'
export {AssistantModal} from './primitives/assistant-modal/assistant-modal.js'
export {QueueItem, QueueItemProvider, type QueuedMessage} from './primitives/queue-item/queue-item.js'
export {
  SelectionToolbar,
  useSelectionToolbarInfo,
  type SelectionInfo,
} from './primitives/selection-toolbar/selection-toolbar.js'

// Behaviors.
export {useThreadAutoScroll} from './behaviors/use-thread-auto-scroll.js'
export {useTopAnchorReserve} from './behaviors/use-top-anchor-reserve.js'
export {useScrollLock} from './behaviors/use-scroll-lock.js'
export {useSizeHandle} from './behaviors/use-size-handle.js'

// Styled set (neutral, themeable — references only --chat-* tokens).
export {Thread, type ThreadComponents, type ThreadProps} from './styled/thread.js'
export {Composer, type ComposerProps} from './styled/composer.js'
export {Markdown, type MarkdownProps} from './styled/markdown.js'
export {Reasoning, type ReasoningProps} from './styled/reasoning.js'
export {ChainOfThought, type ChainOfThoughtProps} from './styled/chain-of-thought.js'
export {ToolFallback} from './styled/tool-fallback.js'
export {CollapsibleCard, type CollapsibleCardProps} from './styled/collapsible-card.js'
export {TooltipIconButton, type TooltipIconButtonProps} from './styled/tooltip-icon-button.js'
export {AssistantActionBar, UserActionBar} from './styled/action-bar.js'
export {BranchPicker} from './styled/branch-picker.js'
export {FollowUpSuggestions} from './styled/follow-up-suggestions.js'
export {ToolGroup, type ToolGroupProps} from './styled/tool-group.js'
export {AttachmentUI} from './styled/attachment-ui.js'
