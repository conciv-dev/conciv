import {createContext, useContext, type Accessor} from 'solid-js'

// The scroll viewport seam. Thread.Viewport owns the element + at-bottom flag + scrollToBottom; the
// real top-anchor ↔ stick-to-bottom coordinator (Phase 3 behaviors) plugs in here. ScrollToBottom
// and the autoscroll behaviors read it.
export type ViewportContextValue = {
  isAtBottom: Accessor<boolean>
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

const ViewportContext = createContext<ViewportContextValue>()

export const ViewportProvider = ViewportContext.Provider

export function useThreadViewport(): ViewportContextValue {
  const context = useContext(ViewportContext)
  if (!context) throw new Error('Thread.ScrollToBottom must be used within a Thread.Viewport')
  return context
}
