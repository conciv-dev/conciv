export {createChat, createChatSession} from './session/session.js'
export type {
  Chat,
  ChatApprovalScope,
  ChatSession,
  ChatSessionCallbacks,
  ChatSessionConnection,
  ChatSessionHydration,
  CreateChatOptions,
  CreateChatSessionOptions,
} from './session/session.js'
export {fetchServerSentEvents, webSocket} from '@tanstack/ai-client'
export type {
  ConnectConnectionAdapter,
  QueuedMessage,
  ResumableConnectConnectionAdapter,
  SubscribeConnectionAdapter,
} from '@tanstack/ai-client'
