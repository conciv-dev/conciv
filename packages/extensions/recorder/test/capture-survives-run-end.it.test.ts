import {randomUUID} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {fetchServerSentEvents} from '@tanstack/ai-client'
import {CHAT_SSE_PATH} from '@conciv/protocol/chat-types'
import {createFakeHarness} from '@conciv/harness-testkit'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi({harness: createFakeHarness()})

async function runAgentTurnToCompletion(): Promise<void> {
  const abort = new AbortController()
  const connection = fetchServerSentEvents(`${api().apiBase}${CHAT_SSE_PATH}`)
  const turn = connection.connect(
    [{id: randomUUID(), role: 'user', parts: [{type: 'text', content: 'hello'}]}],
    {},
    abort.signal,
    {threadId: api().session, runId: randomUUID()},
  )
  for await (const chunk of turn) {
    if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') break
  }
  abort.abort()
}

describe('requested recordings survive run end (real browser)', () => {
  it('keeps the capture live across a finished agent run and still records later user actions', async () => {
    const started = z.object({captureId: z.string()}).parse(await api().callTool('recording_start', {}))
    await runAgentTurnToCompletion()
    await addMarker(api().page)
    const stopped = JSON.stringify(await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0}))
    expect(stopped).not.toContain('no active capture')
    expect(stopped).toContain('click')
    expect(stopped).toContain('Add marker')
  }, 120_000)
})
