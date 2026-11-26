import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/test-file-top-level.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const testFile = '/repo/src/view.test.ts'
const topLevel = {messageId: 'topLevel'}

tester.run('test-file-top-level', rule, {
  valid: [
    {
      name: 'imports and a describe with its test inside',
      code: "import {describe, test} from 'vitest'\ndescribe('a', () => { const value = 1; test('b', () => {}) })",
      filename: testFile,
    },
    {name: 'a bare test', code: "test('a', () => {})", filename: testFile},
    {name: 'a bare it', code: "it('a', () => {})", filename: testFile},
    {name: 'describe.each', code: "describe.each([1])('a %s', () => {})", filename: testFile},
    {name: 'test.each', code: "test.each([1])('a %s', () => {})", filename: testFile},
    {name: 'test.concurrent', code: "test.concurrent('a', () => {})", filename: testFile},
    {
      name: 'a Playwright test.describe in an e2e spec',
      code: "test.describe('a', () => {})",
      filename: '/repo/e2e/a.spec.ts',
    },
    {name: 'a source file', code: 'const value = 1', filename: '/repo/src/view.ts'},
    {
      name: 'a RuleTester file',
      code: "const tester = new RuleTester()\nconst code = 'a'\ntester.run('rule', rule, {valid: [], invalid: []})",
      filename: '/repo/src/rule.test.js',
    },
  ],
  invalid: [
    {name: 'a constant', code: 'const value = 1', filename: testFile, errors: [topLevel]},
    {name: 'a helper function', code: 'function helper() {}', filename: testFile, errors: [topLevel]},
    {name: 'a test.extend', code: 'const test = base.extend({})', filename: testFile, errors: [topLevel]},
    {name: 'a hook', code: 'beforeEach(() => {})', filename: testFile, errors: [topLevel]},
    {name: 'a hook on test', code: 'test.beforeEach(() => {})', filename: '/repo/e2e/a.spec.ts', errors: [topLevel]},
    {name: 'a type alias', code: 'type Value = number', filename: testFile, errors: [topLevel]},
    {name: 'an export', code: 'export const value = 1', filename: testFile, errors: [topLevel]},
    {
      name: 'a run on something that is not a RuleTester',
      code: "const runner = makeRunner()\nrunner.run('rule', rule, {})",
      filename: testFile,
      errors: [topLevel, topLevel],
    },
  ],
})
