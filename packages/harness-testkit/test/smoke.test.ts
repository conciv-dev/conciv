import {expect, it} from 'vitest'
import {until} from '../src/testkit.js'

it('package resolves', () => {
  expect(typeof until).toBe('function')
})
