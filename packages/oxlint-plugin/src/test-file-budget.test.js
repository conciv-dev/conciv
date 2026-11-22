import {describe, it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {relative} from 'node:path'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './test-file-budget.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const fixturePackage = fileURLToPath(new URL('./fixtures/test-file-budget', import.meta.url))
const packageDirectory = relative(process.cwd(), fixturePackage)
const code = 'export {}'

tester.run('test-file-budget', rule, {
  valid: [
    {
      name: 'a test file that is not the first of an over-budget package',
      code,
      filename: `${fixturePackage}/test/b.test.ts`,
    },
    {name: 'a package within a raised budget', code, filename: `${fixturePackage}/test/a.test.ts`, options: [{max: 3}]},
    {name: 'a source file', code, filename: `${fixturePackage}/src/view.ts`},
  ],
  invalid: [
    {
      name: 'the first test file under test/ past the budget',
      code,
      filename: `${fixturePackage}/test/a.test.ts`,
      errors: [{messageId: 'overBudget', data: {packageDirectory, count: 3, max: 2}}],
    },
    {
      name: 'a colocated test file with no source beside it',
      code,
      filename: `${fixturePackage}/src/view.test.ts`,
      errors: [{messageId: 'overSources', data: {packageDirectory, count: 1, sources: 0}}],
    },
  ],
})
