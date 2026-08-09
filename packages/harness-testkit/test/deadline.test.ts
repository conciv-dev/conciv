import {setTimeout as delay} from 'node:timers/promises'
import {expect, it} from 'vitest'
import {abortOnDeadline, withDeadline} from '../src/deadline.js'
import {serveApp} from '../src/serve-app.js'
import {until} from '../src/until.js'

function armedTimers(): number {
  return process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length
}

async function reachable(base: string): Promise<boolean> {
  return fetch(base).then(
    () => true,
    () => false,
  )
}

it('a synchronous throw rejects without leaving the deadline timer armed', async () => {
  const before = armedTimers()
  await expect(
    withDeadline(60_000, 'never reached', () => {
      throw new Error('boom')
    }),
  ).rejects.toThrow('boom')
  expect(armedTimers()).toBe(before)
}, 2_000)

it('aborts the caller controller when the deadline rejects', async () => {
  const abort = new AbortController()
  await expect(
    abortOnDeadline(abort, 100, 'opening the stream exceeded 100ms', () => new Promise<string>(() => {})),
  ).rejects.toThrow('opening the stream exceeded 100ms')
  expect(abort.signal.aborted).toBe(true)
}, 2_000)

it('disposes a result that arrives after the deadline', async () => {
  const served = await serveApp(() => new Response('ok'))
  await expect(
    withDeadline(
      100,
      'serving exceeded 100ms',
      async () => {
        await delay(400)
        return served
      },
      (late) => late.close(),
    ),
  ).rejects.toThrow('serving exceeded 100ms')
  await until(async () => !(await reachable(served.base)), {hangGuardMs: 3_000})
}, 6_000)
