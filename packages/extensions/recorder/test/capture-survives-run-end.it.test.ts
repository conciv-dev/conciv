import {randomUUID} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createFakeHarness, makeRpcClient} from '@conciv/harness-testkit'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi({harness: createFakeHarness()})

async function runAgentTurnToCompletion(): Promise<void> {
  const rpc = makeRpcClient(api().apiBase)
  const abort = new AbortController()
  const stream = await rpc.chat.subscribe({sessionId: api().session}, {signal: abort.signal})
  await rpc.chat.send({sessionId: api().session, runId: randomUUID(), text: 'hello'})
  for await (const chunk of stream) {
    if (chunk.type === 'RUN_FINISHED') break
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
