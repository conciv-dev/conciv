import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './no-teardown-hooks.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const teardown = 'afterEach(() => {})'
const teardownError = {messageId: 'noTeardownHook', data: {name: 'afterEach'}}

tester.run('no-teardown-hooks', rule, {
  valid: [
    {name: 'an it test under src', code: teardown, filename: '/repo/src/view.it.test.ts'},
    {name: 'a browser test under src', code: teardown, filename: '/repo/src/view.browser.test.ts'},
    {name: 'a test under test', code: teardown, filename: '/repo/test/view.test.ts'},
    {name: 'a test under srcx', code: teardown, filename: '/repo/srcx/view.test.ts'},
    {name: 'a source under src', code: teardown, filename: '/repo/src/view.ts'},
    {name: 'a nameless test under src', code: teardown, filename: '/repo/src/.test.ts'},
    {
      name: 'a path repeating /src/a 60000 times',
      code: teardown,
      filename: `/repo/src/${'/src/a'.repeat(60_000)}.ts`,
    },
    {name: 'a hook that is not a teardown', code: 'beforeEach(() => {})', filename: '/repo/src/view.test.ts'},
    {name: 'an object key named afterEach', code: 'const hooks = {afterEach: 1}', filename: '/repo/src/view.test.ts'},
  ],
  invalid: [
    {name: 'a test under src', code: teardown, filename: '/repo/src/view.test.ts', errors: [teardownError]},
    {name: 'a deep test under src', code: teardown, filename: '/repo/src/a/b/view.test.tsx', errors: [teardownError]},
    {name: 'a test under src, Windows', code: teardown, filename: '/repo\\src\\view.test.ts', errors: [teardownError]},
    {
      name: 'a deep test under src, Windows',
      code: teardown,
      filename: '/repo\\src\\a\\b\\view.test.tsx',
      errors: [teardownError],
    },
    {
      name: 'onTestFinished off the test context',
      code: "test('runs', ({onTestFinished}) => {})\ntest('ends', (context) => context.onTestFinished(close))",
      filename: '/repo/src/view.test.ts',
      errors: [
        {messageId: 'noTeardownHook', data: {name: 'onTestFinished'}},
        {messageId: 'noTeardownHook', data: {name: 'onTestFinished'}},
      ],
    },
    {
      name: 'afterEach taken out of vitest',
      code: "const {afterEach} = await import('vitest')",
      filename: '/repo/src/view.test.ts',
      errors: [teardownError],
    },
  ],
})
