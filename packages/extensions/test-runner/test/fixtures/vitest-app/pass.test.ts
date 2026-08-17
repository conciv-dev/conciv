import {describe, test, expect} from 'vitest'

test('one plus one', () => {
  expect(1 + 1).toBe(2)
})

describe('first suite', () => {
  test('shares a title', () => {
    expect(1).toBe(1)
  })
})

describe('second suite', () => {
  test('shares a title', () => {
    expect(2).toBe(2)
  })
})
