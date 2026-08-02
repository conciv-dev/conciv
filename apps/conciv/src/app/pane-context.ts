import {createContext, createSignal, useContext, type Accessor} from 'solid-js'
import type {Grab, GrabProvider} from '@conciv/grab'

export type StagedGrab = Grab | {text: string}

export type PaneGrabStore = {
  grabs: Accessor<StagedGrab[]>
  stage: (grab: Grab) => void
  stageTexts: (texts: string[]) => void
  stageAll: (grabs: StagedGrab[]) => void
  replace: (grab: StagedGrab, next: StagedGrab) => void
  remove: (grab: StagedGrab) => void
  clear: () => void
}

export function makeGrabStore(): PaneGrabStore {
  const [grabs, setGrabs] = createSignal<StagedGrab[]>([])
  return {
    grabs,
    stage: (grab) => setGrabs((prev) => [...prev, grab]),
    stageTexts: (texts) => setGrabs(texts.map((text) => ({text}))),
    stageAll: (staged) => setGrabs((prev) => [...prev, ...staged.filter((grab) => !prev.includes(grab))]),
    replace: (grab, next) => setGrabs((prev) => prev.map((entry) => (entry === grab ? next : entry))),
    remove: (grab) => setGrabs((prev) => prev.filter((entry) => entry !== grab)),
    clear: () => setGrabs([]),
  }
}

export type PendingAttachmentQueue = {
  enqueue: (file: File) => void
  drain: () => File[]
}

export type PaneContextValue = {
  sessionId: Accessor<string>
  running: Accessor<boolean>
  attached: Accessor<boolean>
  viewLocked: Accessor<boolean>
  setLockedFor: (id: string) => (locked: boolean) => void
  slideClass: Accessor<string>
  resetSlide: () => void
  grabStore: PaneGrabStore
  grabProvider: GrabProvider | undefined
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
