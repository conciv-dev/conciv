import {describe, expect, it} from 'vitest'
import {deadline, TESTKIT_DEADLINE_MS} from '../src/deadline.js'

describe('deadline', () => {
  it('passes the value through when the work settles inside the budget', async () => {
    await expect(deadline('testkit sessions.resolve', 500, Promise.resolve('session-1'))).resolves.toBe('session-1')
  })

  it('rejects with the stage label and the budget when the work never settles', async () => {
    const started = performance.now()
    await expect(deadline('testkit chat.subscribe', 60, new Promise(() => {}))).rejects.toThrow(
      'testkit chat.subscribe exceeded 60ms',
    )
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('keeps the original failure when the work rejects inside the budget', async () => {
    await expect(
      deadline('testkit engine stop', 500, Promise.reject(new Error('port already closed'))),
    ).rejects.toThrow('port already closed')
  })

  it('bounds a stage with the shared testkit budget when none is given', async () => {
    await expect(deadline('testkit browser close', TESTKIT_DEADLINE_MS, Promise.resolve('closed'))).resolves.toBe(
      'closed',
    )
  })
})
