import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './no-locator-poll.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()

tester.run('no-locator-poll', rule, {
  valid: [
    {name: 'a web-first assertion', code: 'await expect(row).toHaveText("done")'},
    {name: 'a poll over a value that is not a locator read', code: 'await expect.poll(() => runs.length).toBe(2)'},
    {name: 'a locator read outside a poll', code: 'const text = await row.textContent()'},
    {
      name: 'a poll over a computed member call named like a locator read',
      code: 'await expect.poll(async () => await row[textContent]()).toBe("done")',
    },
  ],
  invalid: [
    {
      name: 'a poll over a locator read inside a callback',
      code: 'await expect.poll(async () => await row.textContent()).toBe("done")',
      errors: [{messageId: 'noLocatorPoll', data: {method: 'textContent', replacement: 'toHaveText'}}],
    },
  ],
})
