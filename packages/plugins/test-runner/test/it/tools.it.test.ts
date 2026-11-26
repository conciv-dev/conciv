import {describe} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {TestLLM} from '@conciv/backend-test-utils'

describe("the agent runs the project's tests", () => {
  test('the agent is told about the runner, lists the files, reads an empty status, runs everything, narrows a run with a pattern, reads the last run, and two runs asked at once each report their own tests', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine(
      {plugins: ['@conciv/plugin-test-runner']},
      {directory: 'test/fixtures/plant-shop'},
    )
    await engine.reply(TestLLM.text('I will run them'))
    await engine.session.send('Run the tests')

    const [request] = await engine.requests()
    expect(request?.system.join('\n')).toContain('    <id>test-runner</id>')
    expect(request?.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['test_runner_run', 'test_runner_status']),
    )
    expect(await engine.session.tool('test_runner_list').call({})).toEqual({
      files: expect.arrayContaining([
        {file: expect.stringContaining('/plant-shop/cart.test.js'), relPath: 'cart.test.js'},
        {file: expect.stringContaining('/plant-shop/discount.test.js'), relPath: 'discount.test.js'},
      ]),
    })
    expect(await engine.session.tool('test_runner_status').call({})).toEqual({
      summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0},
      failures: [],
      tests: [],
    })

    expect(await engine.session.tool('test_runner_run').call({})).toMatchObject({
      summary: {passed: 1, failed: 1, skipped: 0},
      failures: [
        {
          file: expect.stringContaining('discount.test.js'),
          name: 'the spring discount takes 10 off',
          message: 'expected 11 to be 2 // Object.is equality',
        },
      ],
    })
    expect(await engine.session.tool('test_runner_run').call({pattern: 'cart'})).toMatchObject({
      summary: {passed: 1, failed: 0, skipped: 0},
      failures: [],
      tests: [{name: 'a fern in the cart costs 12', state: 'pass'}],
    })
    expect(await engine.session.tool('test_runner_status').call({})).toMatchObject({
      summary: {passed: 1, failed: 0, skipped: 0},
      tests: [{name: 'a fern in the cart costs 12', state: 'pass'}],
    })

    const [cart, discount] = await Promise.all([
      engine.session.tool('test_runner_run').call({pattern: 'cart'}),
      engine.session.tool('test_runner_run').call({pattern: 'discount'}),
    ])
    expect(cart).toMatchObject({tests: [{name: 'a fern in the cart costs 12', state: 'pass'}]})
    expect(discount).toMatchObject({tests: [{name: 'the spring discount takes 10 off', state: 'fail'}]})
  })
})

describe('the runner is stopped from outside', () => {
  test('a client joining mid-run reads the run so far, a second run waits, stop ends the run that never finishes with the results it had, the waiting run then runs and is read back, and a restarted engine has no run', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine(
      {plugins: ['@conciv/plugin-test-runner']},
      {directory: 'test/fixtures/greenhouse'},
    )
    const started = await engine.event('rpc.test-runner.event', {data: {type: 'run-start', runId: 'r1'}})

    const endless = engine.rpc.call('test-runner', 'run', {})
    expect((await started.arrived).data).toMatchObject({
      type: 'run-start',
      files: expect.arrayContaining([expect.stringContaining('watering.test.js')]),
    })
    await expect
      .poll(() => engine.rpc.call('test-runner', 'current'))
      .toMatchObject({
        events: expect.arrayContaining([
          expect.objectContaining({type: 'run-start'}),
          expect.objectContaining({type: 'test', name: 'the seeds sprout', state: 'pass'}),
          expect.objectContaining({type: 'test', name: 'the pruned rose blooms', state: 'fail'}),
        ]),
        unavailable: null,
      })
    const next = await engine.event('rpc.test-runner.event')
    const waiting = engine.rpc.call('test-runner', 'run', {patterns: ['beds']})
    expect(await engine.rpc.call('test-runner', 'stop')).toEqual({ok: true})
    expect((await next.arrived).data).toMatchObject({
      type: 'run-end',
      runId: 'r1',
      summary: {passed: 1, failed: 1, skipped: 0},
      failures: [{name: 'the pruned rose blooms'}],
    })
    expect(await endless).toMatchObject({
      summary: {passed: 1, failed: 1, skipped: 0},
      failures: [{name: 'the pruned rose blooms'}],
    })

    expect(await waiting).toMatchObject({
      summary: {passed: 1, failed: 1, skipped: 0},
      failures: [{name: 'the pruned rose blooms', message: 'expected 3 to be 4 // Object.is equality'}],
      tests: expect.arrayContaining([expect.objectContaining({file: expect.stringContaining('beds/pruning.test.js')})]),
    })
    expect(await engine.rpc.call('test-runner', 'status')).toMatchObject({
      summary: {passed: 1, failed: 1, skipped: 0},
      failures: [{name: 'the pruned rose blooms'}],
    })
    expect(await engine.rpc.call('test-runner', 'list', {})).toEqual({
      files: expect.arrayContaining([
        {file: expect.stringContaining('/greenhouse/watering.test.js'), relPath: 'watering.test.js'},
        {file: expect.stringContaining('/greenhouse/beds/pruning.test.js'), relPath: 'beds/pruning.test.js'},
      ]),
    })

    await engine.restart()
    expect(await engine.rpc.call('test-runner', 'status')).toEqual({
      summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0},
      failures: [],
      tests: [],
    })
    expect(await engine.rpc.call('test-runner', 'current')).toEqual({events: null, unavailable: null})
  })
})

describe.concurrent('a runner the plugin does not implement', () => {
  test.for(['jest', 'node-test'])(
    'with runner %s the plugin does not start, so the agent is offered neither its skill nor its tools',
    async (runner, {createEngine, expect}) => {
      const engine = await createEngine(
        {plugins: [['@conciv/plugin-test-runner', {runner}]]},
        {directory: 'test/fixtures/plant-shop'},
      )
      await engine.reply(TestLLM.text('There is no test runner'))
      await engine.session.send('Run the tests')

      const [request] = await engine.requests()
      expect(request?.system.join('\n')).not.toContain('    <id>test-runner</id>')
      expect(request?.tools.map((tool) => tool.name)).not.toContain('test_runner_run')
    },
  )
})

describe('a playwright project', () => {
  test('the agent lists the spec files, runs them all and narrows a run to one file', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine(
      {plugins: [['@conciv/plugin-test-runner', {runner: 'playwright'}]]},
      {directory: 'test/fixtures/seed-catalog'},
    )

    expect(await engine.session.tool('test_runner_list').call({})).toEqual({
      files: expect.arrayContaining([
        {file: expect.stringContaining('/seed-catalog/catalog.spec.js'), relPath: 'catalog.spec.js'},
        {file: expect.stringContaining('/seed-catalog/order.spec.js'), relPath: 'order.spec.js'},
      ]),
    })
    expect(await engine.session.tool('test_runner_run').call({})).toMatchObject({
      summary: {passed: 1, failed: 1, skipped: 0},
      failures: [{file: 'order.spec.js', name: 'an order of three packets costs 9'}],
    })
    expect(await engine.session.tool('test_runner_run').call({pattern: 'catalog.spec'})).toMatchObject({
      summary: {passed: 1, failed: 0, skipped: 0},
      failures: [],
      tests: [{name: 'the catalog lists basil', state: 'pass'}],
    })
  })
})

describe('a project with no vitest', () => {
  test('the run fails telling the agent vitest is missing, and the plugin rpc answers that the runner is unavailable', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-test-runner']})

    expect(await engine.session.tool('test_runner_run').failure({})).toMatchObject({
      message: expect.stringContaining("vitest unavailable: Cannot find module 'vitest/node'"),
    })
    expect(await engine.rpc.failure('test-runner', 'run', {})).toMatchObject({
      type: 'UNAVAILABLE',
      data: {available: false, error: expect.stringContaining("vitest unavailable: Cannot find module 'vitest/node'")},
    })
  })
})
