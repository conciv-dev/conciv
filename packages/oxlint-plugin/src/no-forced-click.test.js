import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './no-forced-click.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const forced = (name) => ({messageId: 'noForcedClick', data: {name}})

tester.run('no-forced-click', rule, {
  valid: [
    {name: 'a plain click', code: 'await user.click(buy)', filename: '/repo/src/view.browser.test.tsx'},
    {
      name: 'a click with other options',
      code: 'await realInput.click(buy, {delay: 0})',
      filename: '/repo/src/view.test.ts',
    },
    {
      name: 'force set to false',
      code: 'await realInput.click(buy, {force: false})',
      filename: '/repo/src/view.test.ts',
    },
    {
      name: 'a forced click outside a test file',
      code: 'await realInput.click(buy, {force: true})',
      filename: '/repo/src/view.ts',
    },
    {name: 'rm with force', code: 'await rm(dir, {recursive: true, force: true})', filename: '/repo/src/view.test.ts'},
    {name: 'rmSync with force', code: 'rmSync(dir, {force: true})', filename: '/repo/e2e/app/test/home.spec.ts'},
    {name: 'a forced hover', code: 'await realInput.hover(buy, {force: true})', filename: '/repo/src/view.test.ts'},
    {
      name: 'a computed force key',
      code: 'await realInput.click(buy, {[force]: true})',
      filename: '/repo/src/view.test.ts',
    },
  ],
  invalid: [
    {
      name: 'a forced kit click',
      code: 'await realInput.click(buy, {force: true})',
      filename: '/repo/src/view.browser.test.tsx',
      errors: [forced('click')],
    },
    {
      name: 'a forced Playwright click in an e2e spec',
      code: "await page.getByRole('heading').click({force: true})",
      filename: '/repo/e2e/vite-react/test/host-page.spec.ts',
      errors: [forced('click')],
    },
    {
      name: 'a forced double click with a quoted key',
      code: "await locator.dblclick({'force': true, delay: 0})",
      filename: '/repo/test/view.test.ts',
      errors: [forced('dblclick')],
    },
    {
      name: 'a forced bare click',
      code: 'await click(buy, {force: true})',
      filename: '/repo\\src\\view.test.ts',
      errors: [forced('click')],
    },
  ],
})
