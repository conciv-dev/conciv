import {test, expect} from '@playwright/test'

// Browser-free: never requests `page`, so no browser binary is needed.
test('one plus one', () => {
  expect(1 + 1).toBe(2)
})

// A nested describe → a nested suite in the report, exercising the parser's recursion.
test.describe('math', () => {
  test('two plus two', () => {
    expect(2 + 2).toBe(4)
  })
})
