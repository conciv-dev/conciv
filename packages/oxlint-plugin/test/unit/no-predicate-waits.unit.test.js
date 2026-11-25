import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/no-predicate-waits.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const filename = 'kit.ts'
const predicateError = [{messageId: 'noPredicateWait'}]

tester.run('no-predicate-waits', rule, {
  valid: [
    {name: 'a function that is not exported', code: 'function waitFor(check: () => boolean) {}', filename},
    {name: 'a callback that returns a value', code: 'export function read(pick: (row: Row) => string) {}', filename},
    {name: 'a Promise of something else', code: 'export function read(load: () => Promise<Row>) {}', filename},
    {name: 'an export with no declaration', code: 'export {waitFor}', filename},
  ],
  invalid: [
    {
      name: 'a boolean predicate',
      code: 'export function waitFor(check: () => boolean) {}',
      filename,
      errors: predicateError,
    },
    {
      name: 'a boolean union',
      code: 'export const waitFor = (check: () => boolean | undefined) => {}',
      filename,
      errors: predicateError,
    },
    {
      name: 'a Promise of a boolean, deep in an options type',
      code: 'export type WaitOptions = {until: {check: () => Promise<boolean>}}',
      filename,
      errors: predicateError,
    },
  ],
})
