import {stat} from 'node:fs/promises'
import {EventType} from '@tanstack/ai'
import {describe, expect, it} from 'vitest'
import type {ChatEvent} from '@conciv/types/chat-event-types'
import {makeTextAdapter} from '@conciv/harness/adapters'
import {runAdapterTurn} from '@conciv/simulation/ai-testkit'
import {guardedAdapter} from '../../src/ai/run-guard.js'

describe('the run guard', () => {
  const started: ChatEvent = {type: EventType.RUN_STARTED, threadId: 'thread', runId: 'run'}
  const finished: ChatEvent = {type: EventType.RUN_FINISHED, threadId: 'thread', runId: 'run', finishReason: 'stop'}

  it('ends a run that starts and then sends no output with the silence limit', async () => {
    const ended = new AbortController()
    const stopped = new AbortController()
    const fired: string[] = []
    async function* startsThenStaysSilent(): AsyncGenerator<ChatEvent> {
      yield started
      await new Promise((resolve) => stopped.signal.addEventListener('abort', resolve, {once: true}))
    }
    const adapter = guardedAdapter(makeTextAdapter('silent', startsThenStaysSilent), {
      ended: ended.signal,
      stopped: stopped.signal,
      startMs: 60_000,
      firstOutputMs: 50,
      closeMs: 60_000,
      onNotStarted: () => fired.push('start limit'),
      onSilence: () => {
        fired.push('silence limit')
        ended.abort({type: EventType.RUN_ERROR, message: 'the run was ended'})
      },
      stop: () => stopped.abort(),
      log: () => undefined,
    })

    const events = await runAdapterTurn(adapter, [{role: 'user', content: 'Hello'}])

    expect(fired).toEqual(['silence limit'])
    expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_ERROR])
    expect(events.at(-1)).toMatchObject({message: 'the run was ended'})
    expect(stopped.signal.aborted).toBe(true)
  })

  it('ends a run only after the adapter has removed the files it wrote for the run', async () => {
    const ended = new AbortController()
    const stopped = new AbortController()
    const runFiles = new Set<string>()
    async function* writesThenWaitsForOutput(): AsyncGenerator<ChatEvent> {
      runFiles.add('tanstack-claude-run.mjs')
      try {
        yield started
        const output = new Promise((resolve) => stopped.signal.addEventListener('abort', resolve, {once: true}))
        ended.abort(finished)
        await output
      } finally {
        await stat(import.meta.filename)
        runFiles.delete('tanstack-claude-run.mjs')
      }
    }
    const adapter = guardedAdapter(makeTextAdapter('cli', writesThenWaitsForOutput), {
      ended: ended.signal,
      stopped: stopped.signal,
      startMs: 60_000,
      firstOutputMs: 60_000,
      closeMs: 60_000,
      onNotStarted: () => undefined,
      onSilence: () => undefined,
      stop: () => stopped.abort(),
      log: () => undefined,
    })

    const events = await runAdapterTurn(adapter, [{role: 'user', content: 'Hello'}])

    expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED])
    expect([...runFiles]).toEqual([])
  })

  it('ends a run whose adapter cleanup never settles once the close limit passes, and says so', async () => {
    const ended = new AbortController()
    const stopped = new AbortController()
    const logged: string[] = []
    async function* cleanupNeverSettles(): AsyncGenerator<ChatEvent> {
      try {
        yield started
        const output = new Promise((resolve) => stopped.signal.addEventListener('abort', resolve, {once: true}))
        ended.abort(finished)
        await output
      } finally {
        await new Promise<never>(() => {})
      }
    }
    const adapter = guardedAdapter(makeTextAdapter('cli', cleanupNeverSettles), {
      ended: ended.signal,
      stopped: stopped.signal,
      startMs: 60_000,
      firstOutputMs: 60_000,
      closeMs: 5,
      onNotStarted: () => undefined,
      onSilence: () => undefined,
      stop: () => stopped.abort(),
      log: (message) => logged.push(message),
    })

    const events = await runAdapterTurn(adapter, [{role: 'user', content: 'Hello'}])

    expect(events.map((event) => event.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED])
    expect(logged).toEqual(['[ai] the adapter stream did not close within 5ms'])
  })
})
