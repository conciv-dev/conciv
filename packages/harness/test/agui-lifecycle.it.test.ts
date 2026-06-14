import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {z} from 'zod'
import {runAgui, textMessage} from '../src/_shared/agui.js'

async function* lines(...ls: string[]) {
  for (const l of ls) yield l
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
})
