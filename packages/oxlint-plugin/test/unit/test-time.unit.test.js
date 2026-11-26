import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import {noInlineTimeouts, noTimersInTests} from '../../src/test-time.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const newLayerTest = '/repo/test/unit/view.unit.test.ts'
const inlineTimeout = [{messageId: 'inlineTimeout'}]

tester.run('no-timers-in-tests', noTimersInTests, {
  valid: [
    {name: 'a read of a property on the timer', code: 'const name = setTimeout.name'},
    {name: 'an object key', code: 'const timers = {setTimeout: 1}'},
  ],
  invalid: [
    {
      name: 'a timer call',
      code: 'setTimeout(done, 10)',
      errors: [{messageId: 'noTimer', data: {name: 'setTimeout'}}],
    },
    {
      name: 'a timer read off window',
      code: 'window.setInterval(tick)',
      errors: [{messageId: 'noTimer', data: {name: 'setInterval'}}],
    },
  ],
})

tester.run('no-inline-timeouts', noInlineTimeouts, {
  valid: [
    {
      name: 'a file outside the new layer',
      code: 'await wait(100)\nsetTimeout(done)',
      filename: '/repo/test/view.test.ts',
    },
    {name: 'a data matcher given an object', code: 'expect(options).toEqual({timeout: 5})', filename: newLayerTest},
    {name: 'a call that is not a wait', code: 'render(view, {timeout: 5})', filename: newLayerTest},
  ],
  invalid: [
    {name: 'a bare sleep', code: 'await wait(100)', filename: newLayerTest, errors: inlineTimeout},
    {name: 'waitForTimeout', code: 'await page.waitForTimeout(100)', filename: newLayerTest, errors: inlineTimeout},
    {
      name: 'a timeout on a Testing Library wait',
      code: "await screen.findByRole('button', {}, {timeout: 5000})",
      filename: newLayerTest,
      errors: inlineTimeout,
    },
    {
      name: 'a timeout on a retrying matcher',
      code: 'await expect(button).toBeVisible({timeout: 1000})',
      filename: newLayerTest,
      errors: inlineTimeout,
    },
    {
      name: 'an interval on expect.poll',
      code: 'await expect.poll(readCount, {interval: 10}).toBe(2)',
      filename: newLayerTest,
      errors: inlineTimeout,
    },
    {name: 'a per-test timeout', code: "test.skip('runs', run, 10_000)", filename: newLayerTest, errors: inlineTimeout},
    {
      name: 'a per-test timeout option',
      code: "it('runs', {timeout: 10_000}, run)",
      filename: newLayerTest,
      errors: inlineTimeout,
    },
    {
      name: 'a timer',
      code: 'setTimeout(done)',
      filename: newLayerTest,
      errors: [{messageId: 'noTimer', data: {name: 'setTimeout'}}],
    },
  ],
})
