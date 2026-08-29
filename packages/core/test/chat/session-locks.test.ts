import {describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {createSessionLocks} from '../../src/chat/session-locks.js'

const SESSION_A = SessionId.parse('conciv_a')
const SESSION_B = SessionId.parse('conciv_b')

describe('session locks', () => {
  it('runs one section at a time per session and lets other sessions through', async () => {
    const locks = createSessionLocks()
    const order: string[] = []
    const held = {release: () => {}}
    const blocked = new Promise<void>((resolve) => {
      held.release = resolve
    })

    const first = locks.serialize(SESSION_A, async () => {
      order.push('a1 enter')
      await blocked
      order.push('a1 leave')
    })
    const second = locks.serialize(SESSION_A, async () => {
      order.push('a2 enter')
    })
    const other = locks.serialize(SESSION_B, async () => {
      order.push('b1 enter')
    })

    await other
    expect(order).toEqual(['a1 enter', 'b1 enter'])

    held.release()
    await Promise.all([first, second])
    expect(order).toEqual(['a1 enter', 'b1 enter', 'a1 leave', 'a2 enter'])
  })

  it('a section that throws still releases the session so the next one runs', async () => {
    const locks = createSessionLocks()
    const failing = locks.serialize(SESSION_A, () => Promise.reject(new Error('section failed')))
    await expect(failing).rejects.toThrow('section failed')
    await expect(locks.serialize(SESSION_A, () => Promise.resolve('next'))).resolves.toBe('next')
  })
})
