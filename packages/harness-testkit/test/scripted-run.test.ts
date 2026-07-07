import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {makeScriptedRun} from '../src/scripted-run.js'

const deps = (): HarnessChatDeps => ({
  cwd: '.',
  sessionId: 's',
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  decide: async (): Promise<'allow' | 'deny'> => 'allow',
})

describe('makeScriptedRun', () => {
  it('emits a full lifecycle with a session-id custom event', async () => {
    const {chatStream} = makeScriptedRun({text: 'hello from fake'})
    const out: StreamChunk[] = []
    for await (const chunk of chatStream(deps())) out.push(chunk)
    expect(out.at(0)?.type).toBe(EventType.RUN_STARTED)
    expect(out.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(out.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
    expect(out.some((c) => c.type === EventType.CUSTOM && c.name === 'fake.session-id')).toBe(true)
  })

  it('holds the turn open until release()', async () => {
    const scripted = makeScriptedRun()
    scripted.hold()
    const chunks: StreamChunk[] = []
    const drain = async (): Promise<void> => {
      for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
    }
    const drained = drain()
    await new Promise((r) => setTimeout(r, 30))
    expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
    scripted.release()
    await drained
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })
})
