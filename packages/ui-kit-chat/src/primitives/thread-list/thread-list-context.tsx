import {createContext, useContext, type Accessor} from 'solid-js'
import type {ChatSessionMeta} from '@conciv/protocol/chat-types'

// ThreadList is backed by the host's session store (NOT tanstack — tanstack has no thread list). The
// widget supplies sessions + actions through this context; the primitives stay neutral.
export type ThreadListActions = {
  sessions: Accessor<ChatSessionMeta[]>
  archived?: Accessor<ChatSessionMeta[]>
  activeId: Accessor<string | null>
  select: (id: string) => void
  create: () => void
  loadMore?: () => void
  hasMore?: Accessor<boolean>
  archive?: (id: string) => void
  unarchive?: (id: string) => void
  remove?: (id: string) => void
}

const ThreadListContext = createContext<ThreadListActions>()

export const ThreadListProvider = ThreadListContext.Provider

export function useThreadList(): ThreadListActions {
  const context = useContext(ThreadListContext)
  if (!context) throw new Error('ThreadList.* must be used within a ThreadListProvider')
  return context
}

const ThreadListItemContext = createContext<ChatSessionMeta>()

export const ThreadListItemProvider = ThreadListItemContext.Provider

export function useThreadListItem(): ChatSessionMeta {
  const context = useContext(ThreadListItemContext)
  if (!context) throw new Error('ThreadListItem.* must be used within a ThreadList.Items')
  return context
}
