import {fileURLToPath} from 'node:url'
import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './playwright-test-in-e2e.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const e2eFile = fileURLToPath(new URL('../../../e2e/app/tests/flow.spec.ts', import.meta.url))
const packageFile = fileURLToPath(new URL('flow.test.ts', import.meta.url))
const outsideError = [{messageId: 'outsideE2e'}]

tester.run('playwright-test-in-e2e', rule, {
  valid: [
    {name: 'an e2e app', code: "import {test} from '@playwright/test'", filename: e2eFile},
    {name: 'another package', code: "import {test} from '@playwright/test-kit'", filename: packageFile},
    {name: 'an export with no source', code: 'export const flow = 1', filename: packageFile},
    {name: 'a dynamic import of a computed name', code: 'import(name)', filename: packageFile},
  ],
  invalid: [
    {name: 'an import', code: "import {test} from '@playwright/test'", filename: packageFile, errors: outsideError},
    {
      name: 'a subpath import',
      code: "import type {Reporter} from '@playwright/test/reporter'",
      filename: packageFile,
      errors: outsideError,
    },
    {
      name: 'a named re-export',
      code: "export {test} from '@playwright/test'",
      filename: packageFile,
      errors: outsideError,
    },
    {name: 'a star re-export', code: "export * from '@playwright/test'", filename: packageFile, errors: outsideError},
    {name: 'a dynamic import', code: "import('@playwright/test')", filename: packageFile, errors: outsideError},
    {
      name: 'a file outside any workspace',
      code: "import {test} from '@playwright/test'",
      filename: '/e2e/app/flow.spec.ts',
      errors: outsideError,
    },
  ],
})
