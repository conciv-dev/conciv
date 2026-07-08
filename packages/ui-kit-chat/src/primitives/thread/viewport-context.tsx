import {createContext, useContext, type Accessor} from 'solid-js'

export type ViewportContextValue = {
  isAtBottom: Accessor<boolean>
  scrollToBottom: (behavior?: ScrollBehavior) => void
  holdPosition: (durationMs?: number) => void
}

const ViewportContext = createContext<ViewportContextValue>()

export const ViewportProvider = ViewportContext.Provider

export function useThreadViewport(): ViewportContextValue {
  const context = useContext(ViewportContext)
  if (!context) throw new Error('Thread.ScrollToBottom must be used within a Thread.Viewport')
  return context
}

export function useOptionalThreadViewport(): ViewportContextValue | undefined {
  return useContext(ViewportContext)
}
