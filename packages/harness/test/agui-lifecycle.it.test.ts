import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {z} from 'zod'
import {runAgui, textMessage} from '../src/_shared/agui.js'

async function* lines(...ls: string[]) {
  for (const l of ls) yield l
}

const looseSchema = z.object({type: z.string()}).loose()

// Message ids minted by one turn, given its threadId.
async function turnMessageIds(threadId: string): Promise<string[]> {
  const out: StreamChunk[] = []
  const gen = runAgui(
    lines('{"type":"x"}'),
    looseSchema,
    {onSessionId() {}, threadId, runId: 'aidx-run'},
    (_e, {mint}) => textMessage(mint('m'), 'hi'),
  )
  for await (const c of gen) out.push(c)
  return out.flatMap((c) => ('messageId' in c && typeof c.messageId === 'string' ? [c.messageId] : []))
}

describe('runAgui lifecycle', () => {
  it('emits RUN_STARTED/RUN_FINISHED with the supplied runId/threadId', async () => {
    const schema = z.object({type: z.string(), text: z.string().optional()}).loose()
    const out: StreamChunk[] = []
    const gen = runAgui(lines('{"type":"x"}'), schema, {onSessionId() {}, runId: 'R1', threadId: 'T1'}, () => [])
    for await (const c of gen) out.push(c)
    const start = out.find((c) => c.type === EventType.RUN_STARTED)
    const end = out.find((c) => c.type === EventType.RUN_FINISHED)
    expect(start).toMatchObject({runId: 'R1', threadId: 'T1'})
    expect(end).toMatchObject({runId: 'R1', threadId: 'T1'})
  })

  it('drops empty TEXT_MESSAGE_CONTENT deltas', () => {
    const chunks = [...textMessage('m1', '')]
    expect(chunks.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(false)
  })

  it('mints message ids unique across turns (no cross-turn collision)', async () => {
    const turn1 = await turnMessageIds('thread-AAA')
    const turn2 = await turnMessageIds('thread-BBB')
    // A reused id makes the widget update an earlier turn's message instead of appending a new one
    // (reply renders above the question / not at all). Distinct turns must mint distinct ids.
    const shared = turn1.filter((id) => turn2.includes(id))
    expect(shared).toEqual([])
  })
})
