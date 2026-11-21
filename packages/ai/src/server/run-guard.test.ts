import {EventType} from '@tanstack/ai'
import {describe, expect, it} from 'vitest'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {makeTextAdapter} from '../adapters/adapters.js'
import {runAdapterTurn} from '../testkit.js'
import {guardedAdapter} from './run-guard.js'

const started: ChatEvent = {type: EventType.RUN_STARTED, threadId: 'thread', runId: 'run'}

async function* startsThenStaysSilent(): AsyncGenerator<ChatEvent> {
  yield started
  await new Promise<never>(() => {})
}

describe('the run guard', () => {
  it('ends a run that starts and then sends no output with the silence limit', async () => {
    const ended = new AbortController()
    const stopped = new AbortController()
    const silence: ChatEvent = {type: EventType.RUN_ERROR, message: 'the agent produced no output within 0s'}
    const adapter = guardedAdapter(makeTextAdapter('silent', startsThenStaysSilent), {
      ended: ended.signal,
      stopped: stopped.signal,
      startMs: 60_000,
      firstOutputMs: 50,
      onNotStarted: () => ended.abort({type: EventType.RUN_ERROR, message: 'the agent did not start'}),
      onSilence: () => ended.abort(silence),
      stop: () => stopped.abort(),
      log: () => undefined,
    })

    const events = await runAdapterTurn(adapter, [{role: 'user', content: 'Hello'}])

    expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_ERROR])
    expect(events.at(-1)).toMatchObject({message: 'the agent produced no output within 0s'})
    expect(stopped.signal.aborted).toBe(true)
  })
})
