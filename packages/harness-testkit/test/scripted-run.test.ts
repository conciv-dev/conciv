import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessRunContext, HarnessTurn} from '@conciv/protocol/harness-types'
import {makeScriptedRun} from '../src/scripted-run.js'

const turn: HarnessTurn = {prompt: 'hi', cwd: '.', resumeSessionId: null, systemPrompt: '', kind: 'chat'}
const ctx = (): HarnessRunContext => ({
  sessionId: 's',
  env: {},
  onSessionId: () => {},
  signal: new AbortController().signal,
  decide: async (): Promise<'allow' | 'deny'> => 'allow',
  threadId: 's',
})

describe('makeScriptedRun', () => {
  it('emits a full lifecycle by default', async () => {
    const {run} = makeScriptedRun({text: 'hello from fake'})
    const out: StreamChunk[] = []
    for await (const chunk of run(turn, ctx())) out.push(chunk)
    expect(out.at(0)?.type).toBe(EventType.RUN_STARTED)
    expect(out.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(out.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
  })

  it('holds the turn open until release()', async () => {
    const scripted = makeScriptedRun()
    scripted.hold()
    const chunks: StreamChunk[] = []
    const drain = async (): Promise<void> => {
      for await (const chunk of scripted.run(turn, ctx())) chunks.push(chunk)
    }
    const drained = drain()
    await new Promise((r) => setTimeout(r, 30))
    expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
    scripted.release()
    await drained
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })
})
