import type {MultimodalContent} from '@tanstack/ai-client'
import type {NoticeTone} from './notify.js'

export const MAX_CONTENT_PARTS = 16

const TOO_MANY_PARTS = 'Too many attachments. Remove some and send again.'
const NOT_CONNECTED = 'Not connected yet. Your message is still in the composer.'

export type SendVerdict = {ok: true} | {ok: false; message: string | null; tone: NoticeTone}

const SILENT: SendVerdict = {ok: false, message: null, tone: 'info'}

function contentText(content: string | MultimodalContent): string {
  if (typeof content === 'string') return content.trim()
  const parts = content.content
  if (typeof parts === 'string') return parts.trim()
  return parts
    .flatMap((part) => (part.type === 'text' ? [part.content] : []))
    .join('\n')
    .trim()
}

function partCount(content: string | MultimodalContent): number {
  if (typeof content === 'string') return contentText(content).length > 0 ? 1 : 0
  return content.content.length
}

export function checkSend(
  content: string | MultimodalContent,
  state: {busy: boolean; connected: boolean},
): SendVerdict {
  const count = partCount(content)
  if (count === 0 || state.busy) return SILENT
  if (count > MAX_CONTENT_PARTS) return {ok: false, message: TOO_MANY_PARTS, tone: 'warn'}
  if (!state.connected) return {ok: false, message: NOT_CONNECTED, tone: 'warn'}
  return {ok: true}
}
