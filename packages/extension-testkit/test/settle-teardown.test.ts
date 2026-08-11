import {expect, test} from 'vitest'
import {settleTeardown} from '../src/settle-teardown.js'

test('all steps succeeding resolves without throwing', async () => {
  const completed: string[] = []
  await settleTeardown([
    {name: 'first', run: async () => void completed.push('first')},
    {name: 'second', run: async () => void completed.push('second')},
  ])
  expect(completed.toSorted()).toEqual(['first', 'second'])
})

test('a wedged step rejects with its own name after its own timeout, and the other steps still complete', async () => {
  const completed: string[] = []
  const wedged = new Promise<void>(() => {})
  await expect(
    settleTeardown([
      {name: 'closeBrowser', run: () => wedged, timeoutMs: 20},
      {name: 'close', run: async () => void completed.push('close')},
      {name: 'stop', run: async () => void completed.push('stop')},
    ]),
  ).rejects.toThrow('testkit closeBrowser exceeded 20ms')
  expect(completed.toSorted()).toEqual(['close', 'stop'])
})

test('a step whose run() throws synchronously still lets a later step complete', async () => {
  const completed: string[] = []
  await expect(
    settleTeardown([
      {
        name: 'throwsSync',
        run: () => {
          throw new Error('boom')
        },
      },
      {name: 'after', run: async () => void completed.push('after')},
    ]),
  ).rejects.toThrow('boom')
  expect(completed).toEqual(['after'])
})
