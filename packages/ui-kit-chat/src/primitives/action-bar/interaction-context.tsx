import {createContext, useContext} from 'solid-js'

export type ActionBarInteractionContextValue = {acquireInteractionLock: () => () => void}

const ActionBarInteractionContext = createContext<ActionBarInteractionContextValue>()

export const ActionBarInteractionProvider = ActionBarInteractionContext.Provider

export function useActionBarInteraction(): ActionBarInteractionContextValue | undefined {
  return useContext(ActionBarInteractionContext)
}
