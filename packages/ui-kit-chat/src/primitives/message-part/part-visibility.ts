import type {ChatPart} from '@conciv/protocol/chat-message-types'

export function partIsModelOnly(part: ChatPart & {metadata?: unknown}): boolean {
  const metadata = part.metadata
  if (typeof metadata !== 'object' || metadata === null) return false
  return 'modelOnly' in metadata && metadata.modelOnly === true
}
