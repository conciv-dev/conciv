import {describe, expect, test} from 'vitest'
import {CODE_LIFETIME_MS, makeCodeStore} from '../../src/engine/engine-login.js'

describe('login code', () => {
  test('five wrong codes void the code, and the right code is refused after that', () => {
    const store = makeCodeStore({now: () => 0, runtime: {runFork: () => undefined}})
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
    const store = makeCodeStore({now: () => clock.now, runtime: {runFork: () => undefined}})
    const first = store.issue()
    clock.now = CODE_LIFETIME_MS - 1

    expect(store.exchange(first.code)).toBe('trusted')
    expect(store.exchange(first.code)).toBe('expired')

    const second = store.issue()
    clock.now += CODE_LIFETIME_MS

    expect(store.exchange(second.code)).toBe('expired')
  })
})
