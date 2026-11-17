import {test, expect} from '@playwright/test'

test('one plus one', () => {
  expect(1 + 1).toBe(2)
})

test.describe('math', () => {
  test('two plus two', () => {
    expect(2 + 2).toBe(4)
  })
})
