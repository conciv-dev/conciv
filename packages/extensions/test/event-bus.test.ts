import {expect, test} from 'vitest'
import {defineExtension, collectServerContributions, emitExtensionEvent} from '../src/index.js'

test('on(session_start) handlers fire on emit; other events do not trigger them', async () => {
  const calls: string[] = []
  const ext = defineExtension({id: 'demo'}).server((mx) => {
    mx.on('session_start', () => {
      calls.push('boot')
    })
    mx.on('tool_execution_start', () => {
      calls.push('tool')
    })
  })

  const contributions = collectServerContributions([ext])
  expect(contributions.handlers.length).toBe(2)

  await emitExtensionEvent(contributions, 'session_start')
  expect(calls).toEqual(['boot'])

  await emitExtensionEvent(contributions, 'tool_execution_start')
  expect(calls).toEqual(['boot', 'tool'])
})

test('a throwing handler does not abort the rest of the lifecycle', async () => {
  const calls: string[] = []
  const ext = defineExtension({id: 'demo'}).server((mx) => {
    mx.on('session_start', () => {
      throw new Error('boom')
    })
    mx.on('session_start', () => {
      calls.push('survived')
    })
  })
  await emitExtensionEvent(collectServerContributions([ext]), 'session_start')
  expect(calls).toEqual(['survived'])
})
