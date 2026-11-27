import {createContext, useContext, type Accessor} from 'solid-js'
import {chatKitErrors} from '@conciv/errors'

export type ThreadScroller = {
  atEnd: Accessor<boolean>
  nearStart: Accessor<boolean>
  landOnEnd: () => void
  glideToEnd: () => void
}

export type ViewportContextValue = {
  isAtBottom: Accessor<boolean>
  isNearTop: Accessor<boolean>
  scrollToBottom: () => void
  sendFromUser: <TResult>(deliver: () => TResult) => TResult
  setScroller: (scroller: ThreadScroller | undefined) => void
}

const ViewportContext = createContext<ViewportContextValue>()

export const ViewportProvider = ViewportContext.Provider

export function useThreadViewport(): ViewportContextValue {
  const context = useContext(ViewportContext)
  if (!context) throw chatKitErrors.OUTSIDE_PROVIDER({part: 'Thread.ScrollToBottom', provider: 'a Thread.Root'})
  return context
}

export function useOptionalThreadViewport(): ViewportContextValue | undefined {
  return useContext(ViewportContext)
}

export function useSendFromUser(): <TResult>(deliver: () => TResult) => TResult {
  const viewport = useContext(ViewportContext)
  return (deliver) => (viewport ? viewport.sendFromUser(deliver) : deliver())
}
