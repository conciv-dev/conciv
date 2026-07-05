import type {ChatMessage, Kit, RunEvents} from '@conciv/harness-testkit'

export async function runTurn(kit: Kit, input: string | ChatMessage, session: string): Promise<RunEvents> {
  const stream = await kit.attach(session)
  await kit.chat(input, session)
  return stream.done()
}

export function countType(events: RunEvents, type: string): number {
  return events.all.filter((chunk) => chunk.type === type).length
}
