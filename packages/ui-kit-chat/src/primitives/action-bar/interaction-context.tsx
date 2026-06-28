import {createContext, useContext} from 'solid-js'

// Mirrors assistant-ui's ActionBarInteractionContext: a sub-action (e.g. the overflow menu while
// open) acquires a lock so an autohiding Root stays visible until every lock is released.
export type ActionBarInteractionContextValue = {acquireInteractionLock: () => () => void}

const ActionBarInteractionContext = createContext<ActionBarInteractionContextValue>()

export const ActionBarInteractionProvider = ActionBarInteractionContext.Provider

export function useActionBarInteraction(): ActionBarInteractionContextValue | undefined {
  return useContext(ActionBarInteractionContext)
}
