import {describe, expect, test} from 'vitest'
import {createEngine} from '../test/engine.js'
import {test as engineTest} from '../test/engine-test.js'
import {CODE_LIFETIME_MS, makeCodeStore} from './engine-login.js'

describe('login code', () => {
  test('five wrong codes void the code, and the right code is refused after that', () => {
    const store = makeCodeStore({now: () => 0, log: () => {}})
    const {code} = store.issue()

    expect([1, 2, 3, 4, 5].map(() => store.exchange('wrong'))).toEqual([
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
      'mismatch',
    ])
    expect(store.exchange(code)).toBe('expired')
  })

  test('a code is trusted once inside its lifetime and refused after it', () => {
    const clock = {now: 0}
    const store = makeCodeStore({now: () => clock.now, log: () => {}})
    const first = store.issue()
    clock.now = CODE_LIFETIME_MS - 1

    expect(store.exchange(first.code)).toBe('trusted')
    expect(store.exchange(first.code)).toBe('expired')

    const second = store.issue()
    clock.now += CODE_LIFETIME_MS

    expect(store.exchange(second.code)).toBe('expired')
  })
})

describe('untrusted socket', () => {
  engineTest(
    'a browser that has not logged in may call only the login procedures, and everything once it logs in',
    async ({untrusted}) => {
      const engine = await createEngine()
      const rpc = untrusted(engine)

      await expect(rpc.sessions.list({})).rejects.toThrow('this connection is not trusted')
      await expect(rpc.auth.exchange({code: await engine.loginCode()})).resolves.toEqual({token: expect.any(String)})
      await expect(rpc.sessions.list({})).resolves.toMatchObject({sessions: expect.any(Array)})
      await expect(rpc.auth.issueCode()).rejects.toMatchObject({code: 'FORBIDDEN'})
    },
  )
})
