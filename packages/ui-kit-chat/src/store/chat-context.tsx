import {
  createContext,
  createEffect,
  createMemo,
  untrack,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {createStore, type SetStoreFunction} from 'solid-js/store'
import type {UseChatReturn} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {diffTurns, type Turn} from './grouping.js'
import {chatBusy} from './chat-busy.js'

export type ViewState = {
  draft: string
  collapsed: Record<string, boolean>
  pinned: Record<string, boolean>
  hovering: string | null
  viewport: {
    turnAnchor: 'top' | 'bottom'
    topAnchorTurn: {anchorId: string; targetId: string} | null
  }
}

export type StoppableChat = UseChatReturn & {stopping?: Accessor<boolean>}

export type ChatContextValue = UseChatReturn & {
  view: ViewState
  setView: SetStoreFunction<ViewState>
  stopping: Accessor<boolean>
}

const ChatContext = createContext<ChatContextValue>()

function pickKeys(record: Record<string, boolean>, live: Set<string>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => live.has(key)))
}

export function ChatProvider(props: ParentProps<{chat: StoppableChat}>): JSX.Element {
  const [view, setView] = createStore<ViewState>({
    draft: '',
    collapsed: {},
    pinned: {},
    hovering: null,
    viewport: {turnAnchor: 'bottom', topAnchorTurn: null},
  })

  createEffect(() => {
    const liveCalls = new Set<string>()
    const liveMessages = new Set<string>()
    for (const message of props.chat.messages()) {
      liveMessages.add(message.id)
      for (const part of message.parts) if (part.type === 'tool-call' && part.id) liveCalls.add(part.id)
    }
    setView('collapsed', (prev) => pickKeys(prev, liveCalls))
    setView('pinned', (prev) => pickKeys(prev, liveMessages))
  })

  const value: ChatContextValue = untrack(() =>
    Object.assign({}, props.chat, {view, setView, stopping: props.chat.stopping ?? ((): boolean => false)}),
  )
  return <ChatContext.Provider value={value}>{props.children}</ChatContext.Provider>
}

export function useChatContext(): ChatContextValue {
  const context = useContext(ChatContext)
  if (!context) throw new Error('useChatContext must be used within a <ChatProvider>')
  return context
}

export function useChatContextOptional(): ChatContextValue | undefined {
  return useContext(ChatContext)
}

export function useThread(): {
  readonly isEmpty: boolean
  readonly isRunning: boolean
  readonly isDisabled: boolean
  readonly turns: Turn[]
} {
  const chat = useChatContext()
  const grouped = createMemo<{messages: ReadonlyArray<UIMessage>; turns: Turn[]}>(
    (prev) => {
      const messages = chat.messages()
      return {messages, turns: diffTurns(prev.turns, prev.messages, messages)}
    },
    {messages: [], turns: []},
  )
  const turns = () => grouped().turns
  const isRunning = createMemo(() => chatBusy(chat))
  return {
    get isEmpty() {
      return turns().length === 0
    },
    get isRunning() {
      return isRunning()
    },
    get isDisabled() {
      return isRunning()
    },
    get turns() {
      return turns()
    },
  }
}

export function useComposer(): {
  text: Accessor<string>
  setText: (value: string) => void
  isEmpty: Accessor<boolean>
  canSend: Accessor<boolean>
  canCancel: Accessor<boolean>
  isStopping: Accessor<boolean>
  send: () => void
  cancel: () => void
} {
  const chat = useChatContext()
  const isRunning = createMemo(() => chatBusy(chat))
  const text = () => chat.view.draft
  const isEmpty = () => chat.view.draft.trim().length === 0
  const canSend = () => !isEmpty()
  const canCancel = () => isRunning()
  const isStopping = createMemo(() => chat.stopping())
  const send = () => {
    if (!canSend()) return
    const content = chat.view.draft.trim()
    chat.setView('draft', '')
    void chat.sendMessage(content)
  }
  const cancel = () => chat.stop()
  return {text, setText: (value) => chat.setView('draft', value), isEmpty, canSend, canCancel, isStopping, send, cancel}
}
