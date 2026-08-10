import {isServer} from 'solid-js/web'
import {expect, test} from 'vitest'

test('reports the runtime', () => {
  expect(isServer).toBe(false)
})
