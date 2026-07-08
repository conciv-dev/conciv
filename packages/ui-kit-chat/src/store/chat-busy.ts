import {createEffect, createSignal, untrack, type Accessor} from 'solid-js'
import type {UseChatReturn} from '@tanstack/ai-solid'

type BusySource = Pick<UseChatReturn, 'status' | 'sessionGenerating'>

export function chatBusy(chat: BusySource): boolean {
  const status = chat.status()
  return status === 'streaming' || status === 'submitted' || chat.sessionGenerating()
}

export type GuardedChat = UseChatReturn & {isBusy: Accessor<boolean>}

export function guardChat(chat: UseChatReturn): GuardedChat {
  const [queue, setQueue] = createSignal<Array<() => void>>([])
  const isBusy = () => chatBusy(chat)

  const enqueue = (run: () => void): Promise<void> => {
    if (isBusy()) setQueue((prev) => [...prev, run])
    else run()
    return Promise.resolve()
  }

  createEffect(() => {
    if (isBusy()) return
    const [next, ...rest] = queue()
    if (!next) return
    setQueue(rest)
    untrack(next)
  })

  const sendMessage: UseChatReturn['sendMessage'] = (content) => enqueue(() => void chat.sendMessage(content))
  const reload: UseChatReturn['reload'] = () => enqueue(() => void chat.reload())

  return Object.assign({}, chat, {isBusy, sendMessage, reload})
}
