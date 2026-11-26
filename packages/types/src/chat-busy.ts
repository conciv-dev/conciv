export type ChatBusySource = {status: () => string; sessionGenerating: () => boolean}

export function chatBusy(chat: ChatBusySource): boolean {
  const status = chat.status()
  return status === 'streaming' || status === 'submitted' || chat.sessionGenerating()
}
