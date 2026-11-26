import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/no-teardown-hooks.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const teardown = 'afterEach(() => {})'
const teardownError = {messageId: 'noTeardownHook', data: {name: 'afterEach'}}

tester.run('no-teardown-hooks', rule, {
  valid: [
    {name: 'a test outside the layout folders', code: teardown, filename: '/repo/test/view.test.ts'},
    {name: 'a unit-named test in test/it', code: teardown, filename: '/repo/test/it/view.unit.test.ts'},
    {name: 'an e2e test in browser mode', code: teardown, filename: '/repo/test/e2e/view.e2e.test.tsx'},
    {name: 'a helper in test/utils', code: teardown, filename: '/repo/test/utils/view.ts'},
    {name: 'a source under src', code: teardown, filename: '/repo/src/view.ts'},
    {name: 'a nameless test in test/unit', code: teardown, filename: '/repo/test/unit/.unit.test.ts'},
    {
      name: 'a path repeating /test/unit/a 60000 times',
      code: teardown,
      filename: `/repo/test/unit/${'/test/unit/a'.repeat(60_000)}.ts`,
    },
    {
      name: 'a hook that is not a teardown',
      code: 'beforeEach(() => {})',
      filename: '/repo/test/unit/view.unit.test.ts',
    },
    {
      name: 'an object key named afterEach',
      code: 'const hooks = {afterEach: 1}',
      filename: '/repo/test/unit/view.unit.test.ts',
    },
  ],
  invalid: [
    {name: 'a unit test', code: teardown, filename: '/repo/test/unit/view.unit.test.ts', errors: [teardownError]},
    {name: 'a deep it test', code: teardown, filename: '/repo/test/it/a/b/view.it.test.tsx', errors: [teardownError]},
    {
      name: 'an it test, Windows',
      code: teardown,
      filename: '/repo\\test\\it\\view.it.test.ts',
      errors: [teardownError],
    },
    {
      name: 'a deep unit test, Windows',
      code: teardown,
      filename: '/repo\\test\\unit\\a\\b\\view.unit.test.tsx',
      errors: [teardownError],
    },
    {
      name: 'onTestFinished off the test context',
      code: "test('runs', ({onTestFinished}) => {})\ntest('ends', (context) => context.onTestFinished(close))",
      filename: '/repo/test/unit/view.unit.test.ts',
      errors: [
        {messageId: 'noTeardownHook', data: {name: 'onTestFinished'}},
        {messageId: 'noTeardownHook', data: {name: 'onTestFinished'}},
      ],
    },
    {
      name: 'afterEach taken out of vitest',
      code: "const {afterEach} = await import('vitest')",
      filename: '/repo/test/unit/view.unit.test.ts',
      errors: [teardownError],
    },
  ],
})
