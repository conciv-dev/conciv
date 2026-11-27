import {createContext, useContext, type Accessor} from 'solid-js'
import type {ChatSessionMeta} from '@conciv/types/chat-types'
import {chatKitErrors} from '../../errors/errors.js'

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
  if (!context) throw chatKitErrors.OUTSIDE_PROVIDER({part: 'ThreadList.*', provider: 'a ThreadListProvider'})
  return context
}

const ThreadListItemContext = createContext<ChatSessionMeta>()

export const ThreadListItemProvider = ThreadListItemContext.Provider

export function useThreadListItem(): ChatSessionMeta {
  const context = useContext(ThreadListItemContext)
  if (!context) throw chatKitErrors.OUTSIDE_PROVIDER({part: 'ThreadListItem.*', provider: 'a ThreadList.Items'})
  return context
}
