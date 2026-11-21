import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './no-await-effect-query.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const awaitedError = [{messageId: 'awaitedQuery'}]

tester.run('no-await-effect-query', rule, {
  valid: [
    {
      name: 'a query piped to a promise runner',
      code: 'async function load() { await db.select().from(runs).pipe(Effect.runPromise) }',
    },
    {
      name: 'a query piped to a runner built from a runtime',
      code: 'async function load() { await db.select().pipe(Effect.runPromiseWith(runtime)) }',
    },
    {name: 'a method on another object', code: 'async function load() { await store.select() }'},
    {name: 'a db method that is not a query', code: 'async function load() { await db.close() }'},
    {name: 'a computed method', code: 'async function load() { await db[select]() }'},
  ],
  invalid: [
    {
      name: 'a query on a db property',
      code: 'async function load() { await this.db.insert(runs).values(row) }',
      errors: awaitedError,
    },
    {
      name: 'an optional chain',
      code: 'async function load() { await db?.query.runs.findMany() }',
      errors: awaitedError,
    },
    {
      name: 'a query piped to something that is not a runner',
      code: 'async function load() { await db.select().pipe(Effect.map(readRows)) }',
      errors: awaitedError,
    },
  ],
})
