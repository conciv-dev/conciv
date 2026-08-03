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

function settleDuration(
  next: Record<string, number>,
  startedAt: Map<string, number>,
  id: string,
  now: () => number,
): void {
  const begun = startedAt.get(id)
  if (begun !== undefined && next[id] === undefined) next[id] = now() - begun
}

export function foldToolDurations(
  messages: ReadonlyArray<{parts: ReadonlyArray<ToolPartLike>}>,
  startedAt: Map<string, number>,
  now: () => number,
  prev: Record<string, number>,
): Record<string, number> {
  const next = {...prev}
  for (const part of toolCallsOf(messages)) {
    if (isSettled(part)) settleDuration(next, startedAt, part.id, now)
    else trackStart(startedAt, part.id, now)
  }
  return next
}
