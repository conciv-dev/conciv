export const MAX_CONTENT_PARTS = 16

export type SendContent = string | {content: string | ReadonlyArray<unknown>}

export type SendState = {busy: boolean; connected: boolean}

export type SendVerdict = {ok: true} | {ok: false; message: string | null; tone: 'info' | 'warn'}

function partCount(content: SendContent): number {
  if (typeof content === 'string') return content.trim().length > 0 ? 1 : 0
  if (typeof content.content === 'string') return content.content.trim().length > 0 ? 1 : 0
  return content.content.length
}

export function checkSend(content: SendContent, state: SendState): SendVerdict {
  if (partCount(content) === 0) return {ok: false, message: null, tone: 'info'}
  if (state.busy) return {ok: false, message: null, tone: 'info'}
  if (typeof content !== 'string' && partCount(content) > MAX_CONTENT_PARTS)
    return {ok: false, message: 'Too many attachments. Remove some and send again.', tone: 'warn'}
  if (!state.connected)
    return {ok: false, message: 'Not connected yet. Your message is still in the composer.', tone: 'warn'}
  return {ok: true}
}
