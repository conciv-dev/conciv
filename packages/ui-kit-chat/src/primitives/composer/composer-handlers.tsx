import {createContext, useContext, type Accessor} from 'solid-js'

export type TriggerItem = {id: string; label: string; insert: string}
export type ComposerHandlers = {
  onSend?: (text: string) => void
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
