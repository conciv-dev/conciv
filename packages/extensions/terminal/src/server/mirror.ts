import type {UIMessage} from '@conciv/protocol/chat-types'

export type MirrorSource = {
  messages(): Promise<UIMessage[]>
}

export function watchMirror(
  source: MirrorSource,
  emit: (payload: {messages: UIMessage[]}) => void,
  intervalMs = 500,
): () => void {
  const state = {fingerprint: ''}
  const tick = async (): Promise<void> => {
    const messages = await source.messages().catch((): UIMessage[] => [])
    const last = messages.at(-1)
    const fingerprint = `${messages.length}:${last?.id ?? ''}:${JSON.stringify(last?.parts ?? []).length}`
    if (fingerprint === state.fingerprint) return
    state.fingerprint = fingerprint
    emit({messages})
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
