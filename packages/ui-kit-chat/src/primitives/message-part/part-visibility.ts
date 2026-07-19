import type {MessagePart} from '@tanstack/ai-client'

export function partIsModelOnly(part: MessagePart & {metadata?: unknown}): boolean {
  const metadata = part.metadata
  if (typeof metadata !== 'object' || metadata === null) return false
  return 'modelOnly' in metadata && metadata.modelOnly === true
}
