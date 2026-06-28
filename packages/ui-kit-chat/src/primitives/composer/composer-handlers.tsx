import {createContext, useContext, type Accessor} from 'solid-js'

// Optional composer capabilities supplied by the host. Each gates a primitive: absent → the button
// renders null (§7). Dictation/trigger-popover/queue all light up only when the widget wires them.
export type TriggerItem = {id: string; label: string; insert: string}
export type ComposerHandlers = {
  onStartDictation?: () => void
  onStopDictation?: () => void
  transcript?: Accessor<string>
  triggerItems?: (query: string, kind: '@' | '/') => TriggerItem[]
  queue?: Accessor<Array<{id: string; text: string}>>
  steerQueued?: (id: string) => void
  removeQueued?: (id: string) => void
}

const ComposerHandlersContext = createContext<ComposerHandlers>({})

export const ComposerHandlersProvider = ComposerHandlersContext.Provider

export function useComposerHandlers(): ComposerHandlers {
  return useContext(ComposerHandlersContext)
}
