import {expect, it} from 'vitest'
import {getHarness} from '@conciv/harness'
import {harnessAvailable} from '../src/harness-available.js'
import {makeCallTool} from '../src/call-tool.js'

it('harnessAvailable returns a boolean for any adapter', () => {
  const claude = getHarness('claude')
  if (!claude) throw new Error('claude adapter not registered')
  expect(typeof harnessAvailable(claude)).toBe('boolean')
})

it('makeCallTool returns a caller', () => {
  expect(typeof makeCallTool('http://127.0.0.1:0', 's')).toBe('function')
})
