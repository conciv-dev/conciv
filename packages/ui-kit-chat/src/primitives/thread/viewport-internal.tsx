import {createContext, useContext, type Accessor} from 'solid-js'

export type ThreadVirtualScroll = {scrollToLast: () => void}

export type ViewportInternalValue = {
  element: Accessor<HTMLElement | undefined>
  turnAnchor: Accessor<'top' | 'bottom'>
  isAtBottom: Accessor<boolean>
  ownsViewport: Accessor<boolean>
  pinToBottom: () => void
  setVirtualScroll: (ops: ThreadVirtualScroll | undefined) => void
}

const ViewportInternalContext = createContext<ViewportInternalValue>()

export const ViewportInternalProvider = ViewportInternalContext.Provider

export function useViewportInternal(): ViewportInternalValue | undefined {
  return useContext(ViewportInternalContext)
}
