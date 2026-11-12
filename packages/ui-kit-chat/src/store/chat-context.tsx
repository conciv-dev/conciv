import {createContext, createMemo, Show, untrack, useContext, type Accessor, type JSX, type ParentProps} from 'solid-js'
import {createStore, type SetStoreFunction} from 'solid-js/store'
import {keyArray} from '@solid-primitives/keyed'
import type {ChatMessage, QueuedMessage, SendContent} from '@conciv/protocol/chat-message-types'
import {chatBusy, type ChatBusySource} from '@conciv/protocol/chat-busy'
import {diffTurns, type Turn} from './grouping.js'

export type ViewState = {
  draft: string
  hovering: string | null
}

export type TurnItem = {key: string; role: Turn['role']; turn: Accessor<Turn>; index: Accessor<number>}

export type Chat = ChatBusySource & {
  messages: Accessor<readonly ChatMessage[]>
  error: Accessor<Error | undefined>
  queue: Accessor<readonly QueuedMessage[]>
  cancelQueued: (id: string) => void
  sendMessage: (content: string | SendContent, options?: {whenBusy?: 'interrupt'}) => Promise<void>
  stop: () => void
  reload: () => Promise<void>
}

export type StoppableChat = Chat & {stopping?: Accessor<boolean>}

export type ChatContextValue = Chat & {
  view: ViewState
  setView: SetStoreFunction<ViewState>
  stopping: Accessor<boolean>
  turns: Accessor<readonly TurnItem[]>
  busy: Accessor<boolean>
}

const ChatContext = createContext<ChatContextValue>()

export function ChatProvider(props: ParentProps<{chat: StoppableChat}>): JSX.Element {
  return (
    <Show when={props.chat} keyed>
      {(chat) => <ChatScope chat={chat}>{props.children}</ChatScope>}
    </Show>
  )
}

function ChatScope(props: ParentProps<{chat: StoppableChat}>): JSX.Element {
  const [view, setView] = createStore<ViewState>({draft: '', hovering: null})
  const grouped = createMemo<{messages: ReadonlyArray<ChatMessage>; turns: Turn[]}>(
    (prev) => {
      const messages = props.chat.messages()
      return {messages, turns: diffTurns(prev.turns, prev.messages, messages)}
    },
    {messages: [], turns: []},
  )
  const turns = createMemo<readonly TurnItem[]>(
    keyArray(
      () => grouped().turns,
      (turn) => turn.key,
      (turn, index): TurnItem => untrack(() => ({key: turn().key, role: turn().role, turn, index})),
    ),
    [],
    {equals: sameTurnItems},
  )
  const busy = createMemo(() => chatBusy(props.chat))
  const value: ChatContextValue = untrack(() =>
    Object.assign({}, props.chat, {
      view,
      setView,
      stopping: props.chat.stopping ?? ((): boolean => false),
      turns,
      busy,
    }),
  )
  return <ChatContext.Provider value={value}>{props.children}</ChatContext.Provider>
}

function sameTurnItems(previous: readonly TurnItem[], next: readonly TurnItem[]): boolean {
  return previous.length === next.length && next.every((item, index) => item === previous[index])
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
  readonly turns: readonly TurnItem[]
} {
  const chat = useChatContext()
  const turns = chat.turns
  const isRunning = chat.busy
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
  isRunning: Accessor<boolean>
  isStopping: Accessor<boolean>
  send: () => void
  cancel: () => void
} {
  const chat = useChatContext()
  const isRunning = chat.busy
  const text = () => chat.view.draft
  const isEmpty = () => chat.view.draft.trim().length === 0
  const isStopping = createMemo(() => chat.stopping())
  const canSend = () => !isEmpty() && !isStopping()
  const canCancel = () => isRunning() && !isStopping()
  const send = () => {
    if (!canSend()) return
    const content = chat.view.draft.trim()
    chat.setView('draft', '')
    void chat.sendMessage(content)
  }
  const cancel = () => chat.stop()
  return {
    text,
    setText: (value) => chat.setView('draft', value),
    isEmpty,
    canSend,
    canCancel,
    isRunning,
    isStopping,
    send,
    cancel,
  }
}
