import {describe, it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {relative} from 'node:path'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './test-file-budget.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const within = fileURLToPath(new URL('./fixtures/test-file-budget/within', import.meta.url))
const over = fileURLToPath(new URL('./fixtures/test-file-budget/over', import.meta.url))
const code = 'export {}'

tester.run('test-file-budget', rule, {
  valid: [
    {name: 'a browser test beside its source', code, filename: `${within}/src/view.browser.test.ts`},
    {name: 'a fourth test file in a package of four sources', code, filename: `${within}/test/a.test.ts`},
    {name: 'a test file that is not the first of an over-budget package', code, filename: `${over}/test/a.test.ts`},
    {name: 'a source file', code, filename: `${over}/src/view.ts`},
  ],
  invalid: [
    {
      name: 'browser tests beside their sources that push the test files past the source files',
      code,
      filename: `${over}/src/list.browser.test.ts`,
      errors: [
        {messageId: 'overSources', data: {packageDirectory: relative(process.cwd(), over), count: 3, sources: 2}},
      ],
    },
  ],
})
