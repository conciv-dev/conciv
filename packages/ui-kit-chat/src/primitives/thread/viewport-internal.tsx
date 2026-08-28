import {createContext, useContext, type Accessor} from 'solid-js'
import type {FollowContent} from '@conciv/solid-stick-to-bottom'

export type ViewportInternalValue = {
  element: Accessor<HTMLElement | undefined>
  turnAnchor: Accessor<'top' | 'bottom'>
  isAtBottom: Accessor<boolean>
  released: Accessor<boolean>
  pinToBottom: () => void
  setContent: (content: FollowContent | undefined) => void
}

const ViewportInternalContext = createContext<ViewportInternalValue>()

export const ViewportInternalProvider = ViewportInternalContext.Provider

export function useViewportInternal(): ViewportInternalValue | undefined {
  return useContext(ViewportInternalContext)
}
