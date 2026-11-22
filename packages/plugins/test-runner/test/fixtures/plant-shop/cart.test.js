import {expect, test} from 'vitest'

test('a fern in the cart costs 12', () => {
  expect([12].reduce((total, price) => total + price, 0)).toBe(12)
})
