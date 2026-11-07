import {partition} from 'es-toolkit'

export type ToolPartLike = {type: string; id?: string; state?: string; output?: unknown}

type ToolCall = ToolPartLike & {id: string}

const isToolCall = (part: ToolPartLike): part is ToolCall => part.type === 'tool-call' && Boolean(part.id)

const isSettled = (part: ToolPartLike): boolean =>
  part.state === 'complete' || part.state === 'error' || part.output !== undefined

const toolCallsOf = (messages: ReadonlyArray<{parts: ReadonlyArray<ToolPartLike>}>): ToolCall[] =>
  messages.flatMap((message) => message.parts).filter(isToolCall)

function trackStart(startedAt: Map<string, number>, id: string, now: () => number): void {
  if (!startedAt.has(id)) startedAt.set(id, now())
}

function settledDuration(
  prev: Record<string, number>,
  startedAt: Map<string, number>,
  part: ToolCall,
  now: () => number,
): [string, number][] {
  const begun = startedAt.get(part.id)
  return begun === undefined || prev[part.id] !== undefined ? [] : [[part.id, now() - begun]]
}

export function foldToolDurations(
  messages: ReadonlyArray<{parts: ReadonlyArray<ToolPartLike>}>,
  startedAt: Map<string, number>,
  now: () => number,
  prev: Record<string, number>,
): Record<string, number> {
  const [settled, running] = partition(toolCallsOf(messages), isSettled)
  for (const part of running) trackStart(startedAt, part.id, now)
  const finished = settled.flatMap((part) => settledDuration(prev, startedAt, part, now))
  if (finished.length === 0) return prev
  return {...prev, ...Object.fromEntries(finished)}
}
