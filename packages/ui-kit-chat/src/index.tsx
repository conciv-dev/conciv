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
export {Primitive, type Slottable} from './primitives/util/primitive.js'
export {
  createActionButton,
  type ActionButtonState,
  type ActionButtonProps,
} from './primitives/util/create-action-button.js'
export {ToolProvider, useToolCtx} from './store/tool-context.js'
export {Thread, type MessagesComponents, type SuggestionData} from './primitives/thread/thread.js'
export {ViewportProvider, useThreadViewport, type ViewportContextValue} from './primitives/thread/viewport-context.js'
export {Message, type PartsComponents} from './primitives/message/message.js'
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
} from './primitives/message-part/message-part.js'
export {Composer} from './primitives/composer/composer.js'
export {
  ComposerProvider,
  useComposerContext,
  type ComposerContextValue,
  type AttachmentDraft,
  type AttachmentPart,
} from './primitives/composer/composer-context.js'
export {ActionBar} from './primitives/action-bar/action-bar.js'
export {
  ActionHandlersProvider,
  useActionHandlers,
  type ActionHandlers,
} from './primitives/action-bar/action-handlers.js'
export {ActionBarMore} from './primitives/action-bar-more/action-bar-more.js'
export {Attachment, AttachmentProvider, useAttachment} from './primitives/attachment/attachment.js'
