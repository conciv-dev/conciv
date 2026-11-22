import {expect, test} from 'vitest'

test('the seeds sprout', () => {
  expect(['basil', 'mint']).toHaveLength(2)
})
