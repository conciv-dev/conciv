import {createContext, useContext} from 'solid-js'
import type {Turn} from '../../store/grouping.js'

export type ActionHandlers = {
  onEdit?: (message: Turn) => void
  onSpeak?: (message: Turn) => void
  onStopSpeaking?: () => void
  onFeedback?: (message: Turn, sentiment: 'positive' | 'negative') => void
}

const ActionHandlersContext = createContext<ActionHandlers>({})

export const ActionHandlersProvider = ActionHandlersContext.Provider

export function useActionHandlers(): ActionHandlers {
  return useContext(ActionHandlersContext)
}
