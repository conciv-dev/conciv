import {createContext, useContext, type Accessor} from 'solid-js'
import type {Grab} from '@conciv/grab'

export type StagedGrab = Grab | {text: string}

export type PaneGrabStore = {
  grabs: Accessor<StagedGrab[]>
  stage: (grab: Grab) => void
  stageTexts: (texts: string[]) => void
  remove: (grab: StagedGrab) => void
  clear: () => void
}

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
  grabStore: PaneGrabStore
  attachments: PendingAttachmentQueue
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
