import {createContext, useContext, type Accessor} from 'solid-js'
import type {ChatSession} from '@conciv/client'

export type PendingAttachmentQueue = {
  enqueue: (file: File) => void
  drain: () => File[]
}

export type PaneContextValue = {
  slideClass: Accessor<string>
  resetSlide: () => void
  attachments: PendingAttachmentQueue
  newSession: () => void
  replaceSession: (sessionId: string) => Promise<void>
  chat: Accessor<ChatSession>
  refresh: () => void
  isRefreshing: Accessor<boolean>
}

export function makePendingAttachmentQueue(): PendingAttachmentQueue {
  const files: File[] = []
  return {
    enqueue: (file) => {
      files.push(file)
    },
    drain: () => files.splice(0),
  }
}

export const PaneContext = createContext<PaneContextValue>()

export function usePane(): PaneContextValue {
  const value = useContext(PaneContext)
  if (!value) throw new Error('usePane called outside a panel session route')
  return value
}
