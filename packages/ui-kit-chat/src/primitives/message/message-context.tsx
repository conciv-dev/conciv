import {createContext, useContext, type Accessor} from 'solid-js'
import type {ChatPart} from '@conciv/types/chat-message-types'
import type {Turn} from '../../store/grouping.js'
import type {createTurnParts} from '../../store/turn-parts.js'
import {chatKitErrors} from '@conciv/errors'

export type MessageContextValue = {
  key: string
  role: Turn['role']
  message: Accessor<Turn>
  index: Accessor<number>
  parts: ReturnType<typeof createTurnParts>
  isLast: Accessor<boolean>
}

const MessageContext = createContext<MessageContextValue>()

export const MessageProvider = MessageContext.Provider

export function useMessage(): MessageContextValue {
  const context = useContext(MessageContext)
  if (!context)
    throw chatKitErrors.OUTSIDE_PROVIDER({part: 'Message.*', provider: 'a Thread.Messages / Message.Root context'})
  return context
}

export type PartContextValue = {part: Accessor<ChatPart>; index: Accessor<number>}

const PartContext = createContext<PartContextValue>()

export const PartProvider = PartContext.Provider

export function usePart(): PartContextValue {
  const context = useContext(PartContext)
  if (!context) throw chatKitErrors.OUTSIDE_PROVIDER({part: 'MessagePart.*', provider: 'a Message.Parts context'})
  return context
}
