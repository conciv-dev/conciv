import {createContext, useContext, type Accessor} from 'solid-js'

export type ThreadScroller = {
  atEnd: Accessor<boolean>
  landOnEnd: () => void
}

export type ViewportContextValue = {
  isAtBottom: Accessor<boolean>
  scrollToBottom: () => void
  setScroller: (scroller: ThreadScroller | undefined) => void
}

const ViewportContext = createContext<ViewportContextValue>()

export const ViewportProvider = ViewportContext.Provider

export function useThreadViewport(): ViewportContextValue {
  const context = useContext(ViewportContext)
  if (!context) throw new Error('Thread.ScrollToBottom must be used within a Thread.Root')
  return context
}

export function useOptionalThreadViewport(): ViewportContextValue | undefined {
  return useContext(ViewportContext)
}
