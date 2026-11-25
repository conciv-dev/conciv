import {describe, it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {relative} from 'node:path'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/test-file-budget.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const root = fileURLToPath(new URL('../fixtures/test-file-budget', import.meta.url))
const options = [{packages: [`${relative(process.cwd(), root)}/*`]}]
const within = `${root}/within`
const over = `${root}/over`
const misplaced = `${root}/misplaced`
const bare = `${root}/bare`
const code = 'export {}'
const longCode = 'export {}\n'.repeat(1000)

tester.run('test-file-budget', rule, {
  valid: [
    {name: 'a unit test in test/unit', code, options, filename: `${within}/test/unit/view.unit.test.ts`},
    {name: 'an it test in test/it', code, options, filename: `${within}/test/it/list.it.test.ts`},
    {name: 'an e2e test in test/e2e', code, options, filename: `${within}/test/e2e/menu.e2e.test.tsx`},
    {name: 'a perf e2e test in test/e2e', code, options, filename: `${within}/test/e2e/menu.perf.e2e.test.tsx`},
    {name: 'a helper in test/utils', code, options, filename: `${within}/test/utils/helper.ts`},
    {name: 'a test-named fixture', code, options, filename: `${within}/test/fixtures/sample.test.ts`},
    {name: 'a source file', code, options, filename: `${within}/src/view.ts`},
    {
      name: 'a test file that is not the first of an over-budget package',
      code,
      options,
      filename: `${over}/test/unit/a.unit.test.ts`,
    },
    {name: 'a package outside the layout globs', code, filename: `${misplaced}/src/a.test.ts`},
  ],
  invalid: [
    {
      name: 'a package that lacks layout folders',
      code,
      options,
      filename: `${bare}/src/a.ts`,
      errors: [
        {
          messageId: 'missingFolders',
          data: {
            packageDirectory: relative(process.cwd(), bare),
            folders: 'test/it, test/e2e, test/fixtures, test/utils',
          },
        },
      ],
    },
    {
      name: 'test files past the source files of the package',
      code,
      options,
      filename: `${over}/test/it/c.it.test.ts`,
      errors: [
        {messageId: 'overSources', data: {packageDirectory: relative(process.cwd(), over), count: 3, sources: 2}},
      ],
    },
    {
      name: 'a test file under src',
      code,
      options,
      filename: `${misplaced}/src/a.test.ts`,
      errors: [{messageId: 'outsideLayout', data: {file: 'src/a.test.ts'}}],
    },
    {
      name: 'a test file in test/utils',
      code,
      options,
      filename: `${misplaced}/test/utils/c.test.ts`,
      errors: [{messageId: 'outsideLayout', data: {file: 'test/utils/c.test.ts'}}],
    },
    {
      name: 'a spec file loose in test',
      code,
      options,
      filename: `${misplaced}/test/d.spec.ts`,
      errors: [{messageId: 'outsideLayout', data: {file: 'test/d.spec.ts'}}],
    },
    {
      name: 'a test whose name kind is not its folder',
      code,
      options,
      filename: `${misplaced}/test/unit/b.it.test.ts`,
      errors: [{messageId: 'wrongKind', data: {file: 'test/unit/b.it.test.ts', kind: 'unit'}}],
    },
    {
      name: 'a test file over 1000 lines',
      code: longCode,
      options,
      filename: `${within}/test/unit/view.unit.test.ts`,
      errors: [{messageId: 'tooLong', data: {lines: 1001, max: 1000}}],
    },
  ],
})
