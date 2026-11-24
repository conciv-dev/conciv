import {describe, expect} from 'vitest'
import {Effect, Fiber, Option, Schema, Stream} from 'effect'
import {PluginEngine, testEffect} from '@conciv/plugin-testkit'

describe("the agent runs the project's tests", () => {
  const it = testEffect(
    PluginEngine.layer({plugins: ['@conciv/plugin-test-runner'], directory: 'test/fixtures/plant-shop'}),
  )

  it.live(
    'the agent is told about the runner, lists the files, reads an empty status, runs everything, narrows a run with a pattern, reads the last run, and two runs asked at once each report their own tests',
    () =>
      Effect.gen(function* () {
        const session = yield* PluginEngine.session()

        expect(yield* PluginEngine.skills()).toContain('    <id>test-runner</id>')
        expect(yield* PluginEngine.tools()).toEqual(expect.arrayContaining(['test_runner_run', 'test_runner_status']))
        expect(yield* session.tool('test_runner_list').call()).toEqual({
          files: expect.arrayContaining([
            {file: expect.stringContaining('/plant-shop/cart.test.js'), relPath: 'cart.test.js'},
            {file: expect.stringContaining('/plant-shop/discount.test.js'), relPath: 'discount.test.js'},
          ]),
        })
        expect(yield* session.tool('test_runner_status').call()).toEqual({
          summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0},
          failures: [],
          tests: [],
        })

        expect(yield* session.tool('test_runner_run').call()).toMatchObject({
          summary: {passed: 1, failed: 1, skipped: 0},
          failures: [
            {
              file: expect.stringContaining('discount.test.js'),
              name: 'the spring discount takes 10 off',
              message: 'expected 11 to be 2 // Object.is equality',
            },
          ],
        })
        expect(yield* session.tool('test_runner_run').call({pattern: 'cart'})).toMatchObject({
          summary: {passed: 1, failed: 0, skipped: 0},
          failures: [],
          tests: [{name: 'a fern in the cart costs 12', state: 'pass'}],
        })
        expect(yield* session.tool('test_runner_status').call()).toMatchObject({
          summary: {passed: 1, failed: 0, skipped: 0},
          tests: [{name: 'a fern in the cart costs 12', state: 'pass'}],
        })

        const [cart, discount] = yield* Effect.all(
          [
            session.tool('test_runner_run').call({pattern: 'cart'}),
            session.tool('test_runner_run').call({pattern: 'discount'}),
          ],
          {concurrency: 'unbounded'},
        )
        expect(cart).toMatchObject({tests: [{name: 'a fern in the cart costs 12', state: 'pass'}]})
        expect(discount).toMatchObject({tests: [{name: 'the spring discount takes 10 off', state: 'fail'}]})
      }),
  )
})

describe('the runner is stopped from outside', () => {
  const it = testEffect(
    PluginEngine.layer({plugins: ['@conciv/plugin-test-runner'], directory: 'test/fixtures/greenhouse'}),
  )
  const isRunStart = Schema.is(Schema.Struct({type: Schema.Literal('run-start'), runId: Schema.Literal('r1')}))

  it.live(
    'a client joining mid-run reads the run so far, a second run waits, stop ends the run that never finishes, the waiting run then runs and is read back, and the panel follows the live events again after the engine stream ends and after it fails',
    () =>
      Effect.gen(function* () {
        const started = yield* PluginEngine.events('rpc.test-runner.event').pipe(
          Stream.filter((event) => isRunStart(event.data)),
          Stream.runHead,
          Effect.forkScoped({startImmediately: true}),
        )

        const endless = yield* PluginEngine.call('test-runner', 'run', {patterns: ['watering']}).pipe(
          Effect.forkScoped({startImmediately: true}),
        )
        const runStart = yield* Fiber.join(started)
        expect(Option.getOrUndefined(runStart)?.data).toMatchObject({
          type: 'run-start',
          files: [expect.stringContaining('watering.test.js')],
        })
        expect(yield* PluginEngine.call('test-runner', 'current')).toMatchObject({
          events: expect.arrayContaining([expect.objectContaining({type: 'run-start'})]),
          unavailable: null,
        })
        const next = yield* PluginEngine.events('rpc.test-runner.event').pipe(
          Stream.runHead,
          Effect.forkScoped({startImmediately: true}),
        )
        const waiting = yield* PluginEngine.call('test-runner', 'run', {patterns: ['beds']}).pipe(
          Effect.forkScoped({startImmediately: true}),
        )
        expect(yield* PluginEngine.call('test-runner', 'stop')).toEqual({ok: true})
        const ended = yield* Fiber.join(next)
        expect(Option.getOrUndefined(ended)?.data).toEqual({
          type: 'run-end',
          runId: 'r1',
          summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0},
          failures: [],
          tests: [],
        })
        yield* Fiber.join(endless)

        expect(yield* Fiber.join(waiting)).toMatchObject({
          summary: {passed: 1, failed: 1, skipped: 0},
          failures: [{name: 'the pruned rose blooms', message: 'expected 3 to be 4 // Object.is equality'}],
          tests: expect.arrayContaining([
            expect.objectContaining({file: expect.stringContaining('beds/pruning.test.js')}),
          ]),
        })
        expect(yield* PluginEngine.call('test-runner', 'status')).toMatchObject({
          summary: {passed: 1, failed: 1, skipped: 0},
          failures: [{name: 'the pruned rose blooms'}],
        })
        expect(yield* PluginEngine.call('test-runner', 'list', {})).toEqual({
          files: expect.arrayContaining([
            {file: expect.stringContaining('/greenhouse/watering.test.js'), relPath: 'watering.test.js'},
            {file: expect.stringContaining('/greenhouse/beds/pruning.test.js'), relPath: 'beds/pruning.test.js'},
          ]),
        })
      }),
  )
})

describe.for(['jest', 'node-test'])('a runner the plugin does not implement: %s', (runner) => {
  const it = testEffect(
    PluginEngine.layer({plugins: [['@conciv/plugin-test-runner', {runner}]], directory: 'test/fixtures/plant-shop'}),
  )

  it.live('the plugin does not start, so the agent is offered neither its skill nor its tools', () =>
    Effect.gen(function* () {
      expect(yield* PluginEngine.skills()).not.toContain('    <id>test-runner</id>')
      expect(yield* PluginEngine.tools()).not.toContain('test_runner_run')
    }),
  )
})

describe('a playwright project', () => {
  const it = testEffect(
    PluginEngine.layer({
      plugins: [['@conciv/plugin-test-runner', {runner: 'playwright'}]],
      directory: 'test/fixtures/seed-catalog',
    }),
  )

  it.live('the agent lists the spec files, runs them all and narrows a run to one file', () =>
    Effect.gen(function* () {
      const session = yield* PluginEngine.session()

      expect(yield* session.tool('test_runner_list').call()).toEqual({
        files: expect.arrayContaining([
          {file: expect.stringContaining('/seed-catalog/catalog.spec.js'), relPath: 'catalog.spec.js'},
          {file: expect.stringContaining('/seed-catalog/order.spec.js'), relPath: 'order.spec.js'},
        ]),
      })
      expect(yield* session.tool('test_runner_run').call()).toMatchObject({
        summary: {passed: 1, failed: 1, skipped: 0},
        failures: [{file: 'order.spec.js', name: 'an order of three packets costs 9'}],
      })
      expect(yield* session.tool('test_runner_run').call({pattern: 'catalog.spec'})).toMatchObject({
        summary: {passed: 1, failed: 0, skipped: 0},
        failures: [],
        tests: [{name: 'the catalog lists basil', state: 'pass'}],
      })
    }),
  )
})
