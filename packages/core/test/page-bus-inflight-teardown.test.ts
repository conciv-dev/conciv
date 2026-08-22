import {expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {makePageBus} from '../src/page-bus.js'

const SESSION = SessionId.parse('conciv_inflight')

function requestIdOf(frames: unknown[]): string {
  const found = frames.flatMap((frame) =>
    typeof frame === 'object' && frame !== null && 'requestId' in frame && typeof frame.requestId === 'string'
      ? [frame.requestId]
      : [],
  )[0]
  if (found === undefined) throw new Error('the bus emitted no request frame')
  return found
}

it('a reply still settles the in-flight ask after the asking widget unsubscribes and a fresh one attaches', async () => {
  const bus = makePageBus(2000)
  const frames: unknown[] = []
  const unsubscribe = bus.subscribe(SESSION, (frame) => frames.push(frame))
  const answered = bus.ask(SESSION, {name: 'fixture.click', input: {}})
  await Promise.resolve()

  unsubscribe()
  bus.subscribe(SESSION, () => {})

  expect(bus.resolve(SESSION, requestIdOf(frames), {ok: true, result: {clicked: 'yes'}})).toBe(true)
  await expect(answered).resolves.toEqual({result: {clicked: 'yes'}})
}, 10_000)
