import {createContext, useContext} from 'solid-js'
import type {Turn} from '../../store/grouping.js'

// Capability handlers supplied by the host. An action whose handler is absent renders null
// (assistant-ui's gating convention, §7) — so we ship every action and the widget lights up what it
// supports. Copy/Reload/ExportMarkdown need no handler (pure client-side over useChat).
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
