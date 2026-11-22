import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './no-mocks.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const newLayerTest = '/repo/src/run.test.ts'

tester.run('no-mocks', rule, {
  valid: [
    {name: 'a file outside the new layer', code: 'vi.fn()', filename: '/repo/test/run.test.ts'},
    {name: 'fake timers', code: 'vi.useFakeTimers()', filename: newLayerTest},
    {name: 'a fn on another object', code: 'mock.fn()', filename: newLayerTest},
  ],
  invalid: [
    {
      name: 'vi.fn',
      code: 'const send = vi.fn()',
      filename: newLayerTest,
      errors: [{messageId: 'noMock', data: {name: 'fn'}}],
    },
  ],
})
