import {assert, describe, expect} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {test, type EngineFixtures} from '@conciv/backend-test-utils'
import {createFakeEngine, FakeLLM} from '@internal/test-utils'
import {renderInTestApp, useFakeEngine} from '@internal/frontend-test-utils'
import {renderTestApp, servePluginBundle} from '@internal/frontend-test-utils/app'
import testRunner from '../../src/plugin-experimental.js'
import type {TestEvent, TestRow, TestRunResult} from '../../src/events.js'
import {createTestRunState} from '../../src/test-utils.js'

describe('the Tests tab', () => {
  const RUNNER = {plugins: ['@conciv/plugin-test-runner']}

  const TEST_RUNNER = {id: '@conciv/plugin-test-runner', plugin: testRunner}

  const testsTab = async (createEngine: EngineFixtures['createEngine']) => {
    const engine = await createEngine(RUNNER, {directory: 'test/fixtures/greenhouse'})
    const app = await renderInTestApp({engine, plugins: [TEST_RUNNER]})
    return {engine, app}
  }

  test('the tab follows a run from no run yet through running to finished, and Fix this puts the failure in the composer and hides the tab', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const {engine, app} = await testsTab(createEngine)

    await user.click(await screen.findByRole('tab', {name: 'Tests'}))
    const panel = await screen.findByRole('tabpanel', {name: 'Tests'})
    expect(await within(panel).findByText('No test run yet')).toBeVisible()
    expect(
      within(panel).getByText('Ask the agent to run the tests; the results show here as they come in.'),
    ).toBeVisible()

    const run = engine.rpc.call('test-runner', 'run', {})
    expect(await within(panel).findByText('Running tests: 1 passed, 1 failed, 0 skipped')).toBeVisible()

    expect(await engine.rpc.call('test-runner', 'stop')).toEqual({ok: true})
    await run
    expect(await within(panel).findByText('Test run finished: 1 passed, 1 failed, 0 skipped')).toBeVisible()
    expect(within(panel).queryByText(/^Running tests/)).not.toBeInTheDocument()
    const failing = within(panel).getByRole('region', {name: '1 failing test'})
    expect(within(failing).getByRole('heading', {name: '1 failing test'})).toBeVisible()
    expect(within(failing).getByText('the pruned rose blooms')).toBeVisible()
    expect(within(failing).getByText('expected 3 to be 4 // Object.is equality')).toBeVisible()
    const files = within(panel).getByRole('region', {name: 'Files'})
    expect(within(files).getByText('beds/seeds.test.js')).toMatchTextContent('Finished: beds/seeds.test.js')
    expect(within(files).getByText('beds/pruning.test.js')).toMatchTextContent('Finished: beds/pruning.test.js')
    expect(within(panel).queryByText('No test run yet')).not.toBeInTheDocument()

    await user.click(within(panel).getByRole('button', {name: 'Fix this'}))
    expect(app.composer.text()).toBe(
      'The test "the pruned rose blooms" in beds/pruning.test.js is failing:\nexpected 3 to be 4 // Object.is equality\nPlease look into it.',
    )
    expect(screen.getByRole('tab', {name: 'Tests', selected: false})).toBeVisible()
    expect(screen.queryByRole('tabpanel', {name: 'Tests'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', {name: 'Tests'}))
    const reopened = await screen.findByRole('tabpanel', {name: 'Tests'})
    expect(await within(reopened).findByText('Test run finished: 1 passed, 1 failed, 0 skipped')).toBeVisible()
  })

  test('a run stopped from outside ends in the tab with the results it had', async ({createEngine}) => {
    const user = userEvent.setup()
    const {engine} = await testsTab(createEngine)

    await user.click(await screen.findByRole('tab', {name: 'Tests'}))
    const panel = await screen.findByRole('tabpanel', {name: 'Tests'})
    const run = engine.rpc.call('test-runner', 'run', {})
    expect(await within(panel).findByText('Running tests: 1 passed, 1 failed, 0 skipped')).toBeVisible()

    expect(await engine.rpc.call('test-runner', 'stop')).toEqual({ok: true})
    await run
    expect(await within(panel).findByText('Test run finished: 1 passed, 1 failed, 0 skipped')).toBeVisible()
    expect(within(panel).queryByText(/^Running tests/)).not.toBeInTheDocument()
    const failing = within(panel).getByRole('region', {name: '1 failing test'})
    expect(within(failing).getByText('the pruned rose blooms')).toBeVisible()
  })

  test('after the engine connection drops and comes back, the tab reads the status again, and a project with no vitest says the runner could not start and why', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const {engine} = await testsTab(createEngine)

    await user.click(await screen.findByRole('tab', {name: 'Tests'}))
    const panel = await screen.findByRole('tabpanel', {name: 'Tests'})
    const run = engine.rpc.call('test-runner', 'run', {})
    expect(await within(panel).findByText('Running tests: 1 passed, 1 failed, 0 skipped')).toBeVisible()
    expect(await engine.rpc.call('test-runner', 'stop')).toEqual({ok: true})
    await run
    await engine.restart()
    expect(await within(panel).findByText('No test run yet')).toBeVisible()
    expect(within(panel).queryByText(/^Running tests/)).not.toBeInTheDocument()

    const bare = await createEngine(RUNNER)
    await renderInTestApp({engine: bare, plugins: [TEST_RUNNER]})
    const bareTab = screen.getAllByRole('tab', {name: 'Tests'}).at(-1)
    assert(bareTab !== undefined)
    await user.click(bareTab)
    expect(await bare.rpc.failure('test-runner', 'run', {})).toMatchObject({type: 'UNAVAILABLE'})
    const barePanel = (await screen.findAllByRole('tabpanel', {name: 'Tests'})).at(-1)
    assert(barePanel !== undefined)
    expect(await within(barePanel).findByText("The project's test runner could not start")).toBeVisible()
    expect(within(barePanel).getByText('The test runner is unavailable')).toBeVisible()
    expect(within(barePanel).getByText(/vitest unavailable: Cannot find module 'vitest\/node'/)).toBeVisible()
  })
})

describe('the run in the thread', () => {
  test('the run the agent starts shows in progress in the thread and the tab, the finished run and the last status show as cards with the reply, a failing test opens to its message, Fix this on a card fills the composer, and a run vitest cannot start tells the agent and shows its reason', async () => {
    const user = userEvent.setup()
    const UNAVAILABLE = "vitest unavailable: Cannot find module 'vitest/node'"
    const discountFailure = {
      file: '/workspace/plant-shop/discount.test.js',
      name: 'the spring discount takes 10 off',
      message: 'expected 11 to be 2 // Object.is equality',
      stack: 'expected 11 to be 2 // Object.is equality',
      line: 3,
    }
    const cart: TestRow = {
      id: 't1',
      file: '/workspace/plant-shop/cart.test.js',
      name: 'a fern in the cart costs 12',
      state: 'pass',
      durationMs: 1,
    }
    const discount: TestRow = {
      id: 't2',
      file: '/workspace/plant-shop/discount.test.js',
      name: 'the spring discount takes 10 off',
      state: 'fail',
      durationMs: 2,
      error: discountFailure,
    }
    const run: TestRunResult = {
      summary: {passed: 1, failed: 1, skipped: 0, durationMs: 4},
      failures: [discountFailure],
      tests: [cart, discount],
    }
    const ran = Promise.withResolvers<TestRunResult>()
    const runState = createTestRunState()
    const TEST_RUNNER_BUILD = {
      id: 'test-runner',
      dist: import.meta.glob<string>(['../../dist/*.cjs', '../../dist/*.cjs.manifest.json'], {
        query: '?raw',
        import: 'default',
      }),
    }
    const engine = useFakeEngine(
      createFakeEngine(
        servePluginBundle(TEST_RUNNER_BUILD, {
          directory: '/workspace/plant-shop',
          plugins: {'test-runner': runState.handlers},
        }),
      ),
    )
    engine.reply(
      FakeLLM.toolCall('c1', 'test_runner_run', {}, () => ran.promise),
      FakeLLM.toolCall('c2', 'test_runner_status', {}, run),
      FakeLLM.text('One test fails'),
      FakeLLM.toolError('c3', 'test_runner_run', {}, UNAVAILABLE),
      FakeLLM.text('Vitest is not installed'),
    )
    await renderTestApp({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Run the tests')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const started: TestEvent[] = [
      {type: 'run-start', runId: 'r1', files: [cart.file, discount.file]},
      {type: 'test', ...cart},
    ]
    runState.events.push(...started)
    started.forEach((event) => engine.emit('rpc.test-runner.event', event))
    expect(await screen.findByText(/^Test run in progress/)).toBeVisible()
    await user.click(screen.getByRole('tab', {name: 'Tests'}))
    const running = await screen.findByRole('tabpanel', {name: 'Tests'})
    expect(await within(running).findByText(/^Running tests/)).toBeVisible()
    await user.click(screen.getByRole('tab', {name: 'Chat'}))
    engine.emit('rpc.test-runner.event', {type: 'test', ...discount})
    engine.emit('rpc.test-runner.event', {
      type: 'run-end',
      runId: 'r1',
      summary: run.summary,
      failures: run.failures,
      tests: run.tests,
    })
    runState.last.result = run
    ran.resolve(run)

    const reply = await screen.findByRole('article', {name: 'Reply to: Run the tests'})
    expect(await within(reply).findByText('One test fails')).toBeVisible()
    const [runCard, readCard] = within(within(reply).getByRole('list', {name: 'Execution trace'})).getAllByRole(
      'listitem',
    )
    assert(runCard !== undefined && readCard !== undefined)
    expect(within(runCard).getByRole('button', {name: /Ran the tests/})).toBeVisible()
    expect(within(runCard).getByRole('status')).toMatchTextContent('Test run finished: 1 passed, 1 failed, 0 skipped')
    expect(within(runCard).getByText('plant-shop/cart.test.js')).toBeVisible()
    expect(within(runCard).getByText('a fern in the cart costs 12')).toBeVisible()
    const failing = within(runCard).getByRole('group', {name: 'the spring discount takes 10 off'})
    expect(within(failing).getByText('expected 11 to be 2 // Object.is equality')).not.toBeVisible()
    await user.click(within(failing).getByText('the spring discount takes 10 off'))
    expect(await within(failing).findByText('expected 11 to be 2 // Object.is equality')).toBeVisible()
    await user.click(within(runCard).getByRole('button', {name: 'Fix this'}))
    const input = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    expect(input).toMatchTextContent('The test "the spring discount takes 10 off" in discount.test.js is failing:')
    expect(input).toMatchTextContent('expected 11 to be 2 // Object.is equality')

    expect(within(readCard).getByRole('button', {name: /Read the last test run/})).toBeVisible()
    expect(within(readCard).getByRole('status')).toMatchTextContent('Test run finished: 1 passed, 1 failed, 0 skipped')

    await user.clear(input)
    await user.type(input, 'Run them again')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const again = await screen.findByRole('article', {name: 'Reply to: Run them again'})
    expect(await within(again).findByText('Vitest is not installed')).toBeVisible()
    await user.click(within(again).getByRole('button', {name: /Vitest unavailable/}))
    expect(await within(again).findByText(/vitest unavailable: Cannot find module 'vitest\/node'/)).toBeVisible()
  })
})
