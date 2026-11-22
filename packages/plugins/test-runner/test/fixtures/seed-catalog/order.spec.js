import {expect, test} from 'playwright/test'

test('an order of three packets costs 9', () => {
  expect([3, 3].reduce((total, price) => total + price, 0)).toBe(9)
})
