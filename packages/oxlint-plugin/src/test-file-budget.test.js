import {describe, it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {relative} from 'node:path'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './test-file-budget.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const fixture = (name) => fileURLToPath(new URL(`./fixtures/test-file-budget/${name}`, import.meta.url))
const within = fixture('within')
const over = fixture('over')
const browsers = fixture('browsers')
const apart = fixture('apart')
const app = fixture('app')
const code = 'export {}'

tester.run('test-file-budget', rule, {
  valid: [
    {name: 'a node test beside its source', code, filename: `${within}/src/view.test.ts`},
    {name: 'a happy-dom test beside its source', code, filename: `${within}/src/list.dom.test.ts`},
    {name: 'a perf test beside its source', code, filename: `${within}/src/menu.perf.test.ts`},
    {name: 'the one browser-mode file of a package', code, filename: `${within}/src/view.browser.test.ts`},
    {name: 'the first browser-mode file of a package with two', code, filename: `${browsers}/src/a.browser.test.ts`},
    {name: 'a test file that is not the first of an over-budget package', code, filename: `${over}/src/view.test.ts`},
    {name: 'an app area browser-mode file', code, filename: `${app}/src/chat.browser.test.tsx`},
    {name: 'a second app area browser-mode file', code, filename: `${app}/src/shell.browser.test.tsx`},
    {name: 'a source file', code, filename: `${over}/src/view.ts`},
  ],
  invalid: [
    {
      name: 'test files past the source files of the package',
      code,
      filename: `${over}/src/list.dom.test.ts`,
      errors: [
        {messageId: 'overSources', data: {packageDirectory: relative(process.cwd(), over), count: 3, sources: 2}},
      ],
    },
    {
      name: 'a second browser-mode file in a package',
      code,
      filename: `${browsers}/src/b.browser.test.ts`,
      errors: [
        {
          messageId: 'secondBrowserFile',
          data: {packageDirectory: relative(process.cwd(), browsers), first: 'src/a.browser.test.ts'},
        },
      ],
    },
    {
      name: 'a node test in src with no source beside it',
      code,
      filename: `${apart}/src/orphan.test.ts`,
      errors: [{messageId: 'noSourceBeside', data: {source: 'orphan'}}],
    },
    {
      name: 'a node test outside src with no source beside it',
      code,
      filename: `${apart}/test/a.test.ts`,
      errors: [{messageId: 'noSourceBeside', data: {source: 'a'}}],
    },
    {
      name: 'an app browser-mode file inside an area folder',
      code,
      filename: `${app}/src/chat/view.browser.test.tsx`,
      errors: [{messageId: 'outsideArea', data: {file: 'src/chat/view.browser.test.tsx'}}],
    },
  ],
})
