import type {UseChatReturn} from '@tanstack/ai-solid'

type BusySource = Pick<UseChatReturn, 'status' | 'sessionGenerating'>

export function chatBusy(chat: BusySource): boolean {
  const status = chat.status()
  return status === 'streaming' || status === 'submitted' || chat.sessionGenerating()
}
