import {createContext, useContext, type Accessor} from 'solid-js'
import type {MessagePart} from '@tanstack/ai-client'
import type {ResultPairing, Turn} from '../../store/grouping.js'

// The current message (a coalesced Turn — the canonical render unit) provided by Thread.Messages /
// Thread.MessageByIndex. Message.* parts read it; no copied data, the Turn is derived from
// chat.messages() upstream.
export type MessageContextValue = {
  message: Accessor<Turn>
  index: Accessor<number>
  pairing: Accessor<ResultPairing>
  isLast: Accessor<boolean>
}

const MessageContext = createContext<MessageContextValue>()

export const MessageProvider = MessageContext.Provider

export function useMessage(): MessageContextValue {
  const context = useContext(MessageContext)
  if (!context) throw new Error('Message.* must be used within a Thread.Messages / Message.Root context')
  return context
}

// The current part within Message.Parts / Message.PartByIndex — read by MessagePart.* and the
// part accessors.
export type PartContextValue = {part: Accessor<MessagePart>; index: Accessor<number>}

const PartContext = createContext<PartContextValue>()

export const PartProvider = PartContext.Provider

export function usePart(): PartContextValue {
  const context = useContext(PartContext)
  if (!context) throw new Error('MessagePart.* must be used within a Message.Parts context')
  return context
}
