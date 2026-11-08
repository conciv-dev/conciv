import {z} from 'zod'
import type {ToolCallPart} from '@conciv/protocol/chat-message-types'
import type {ToolDuration} from '@conciv/protocol/tool-view-types'

const StartStampSchema = z.object({startedAt: z.number().finite()})

const isSettled = (part: ToolCallPart): boolean =>
  part.state === 'complete' || part.state === 'error' || part.output !== undefined

export function foldToolDuration(part: ToolCallPart, previous: ToolDuration, now: () => number): ToolDuration {
  if (previous.ms !== undefined) return previous
  if (!isSettled(part)) return previous.startedAt === undefined ? {startedAt: startOf(part, now)} : previous
  if (previous.startedAt === undefined) return previous
  return {startedAt: previous.startedAt, ms: now() - previous.startedAt}
}

function startOf(part: ToolCallPart, now: () => number): number {
  const stamp = StartStampSchema.safeParse(part.metadata)
  return stamp.success ? stamp.data.startedAt : now()
}
