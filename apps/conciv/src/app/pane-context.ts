import {createContext, useContext, type Accessor} from 'solid-js'
import type {GrabProvider} from '@conciv/grab'
import type {GrabStaging} from '../pane/grab-staging.js'

export type PendingAttachmentQueue = {
  enqueue: (file: File) => void
  drain: () => File[]
}

export type PaneContextValue = {
  sessionId: Accessor<string>
  running: Accessor<boolean>
  viewLocked: Accessor<boolean>
  setLockedFor: (id: string) => (locked: boolean) => void
  slideClass: Accessor<string>
  resetSlide: () => void
  grabStaging: GrabStaging
  grabProvider: GrabProvider | undefined
  attachments: PendingAttachmentQueue
  newSession: () => void
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
