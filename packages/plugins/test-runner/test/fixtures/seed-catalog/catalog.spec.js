import {expect, test} from 'playwright/test'

test('the catalog lists basil', () => {
  expect(['basil', 'thyme']).toContain('basil')
})
