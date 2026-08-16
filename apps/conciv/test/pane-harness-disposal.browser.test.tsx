import './helpers/utilities.css'
import {expect, test} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {mountPane} from './helpers/pane-harness.js'

test('disposing a mounted pane disposes every extension instance it created', () => {
  const order: string[] = []
  const first = defineExtension({name: 'pane-harness-disposal-a'}).client(() => ({
    value: {},
    dispose: () => order.push('a'),
  }))
  const second = defineExtension({name: 'pane-harness-disposal-b'}).client(() => ({
    value: {},
    dispose: () => order.push('b'),
  }))
  const mount = mountPane({base: 'http://127.0.0.1:9', sessionId: 'conciv_1', extensions: [first, second]}, () => (
    <div>pane</div>
  ))

  expect(order).toEqual([])

  mount.dispose()

  expect(order).toEqual(['a', 'b'])
})
