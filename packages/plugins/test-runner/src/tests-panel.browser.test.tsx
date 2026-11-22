import {assert, describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the Tests tab', () => {
  test('the tab says no run yet, shows a finished run with its failure, Fix this sends the failure to the agent, and the tab and the card follow the run the agent starts', async () => {
    const user = userEvent.setup()
    const engine = await createEngine(
      {plugins: ['@conciv/plugin-test-runner']},
      {directory: 'test/fixtures/greenhouse'},
    )
    await engine.reply(TestLLM.toolCall('c1', 'test_runner_run', {}))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Tests'}))
    const panel = await screen.findByRole('tabpanel', {name: 'Tests'})
    expect(await within(panel).findByText('No test run yet')).toBeVisible()
    expect(
      within(panel).getByText('Ask the agent to run the tests; the results show here as they come in.'),
    ).toBeVisible()

    await engine.rpc.call('test-runner', 'run', {patterns: ['beds']})
    expect(await within(panel).findByText('Test run finished: 1 passed, 1 failed, 0 skipped')).toBeVisible()
    const failing = within(panel).getByRole('region', {name: '1 failing test'})
    expect(within(failing).getByRole('heading', {name: '1 failing test'})).toBeVisible()
    expect(within(failing).getByText('the pruned rose blooms')).toBeVisible()
    expect(within(failing).getByText('expected 3 to be 4 // Object.is equality')).toBeVisible()
    const files = within(panel).getByRole('region', {name: 'Files'})
    expect(within(files).getByText('beds/seeds.test.js')).toMatchTextContent('Finished: beds/seeds.test.js')
    expect(within(files).getByText('beds/pruning.test.js')).toMatchTextContent('Finished: beds/pruning.test.js')
    expect(within(panel).queryByText('No test run yet')).not.toBeInTheDocument()

    await user.click(within(panel).getByRole('button', {name: 'Fix this'}))
    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(input).toMatchTextContent('The test "the pruned rose blooms" in beds/pruning.test.js is failing:')
    expect(input).toMatchTextContent('expected 3 to be 4 // Object.is equality')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('Test run in progress: 1 passed, 1 failed, 0 skipped')).toBeVisible()
    await user.click(screen.getByRole('tab', {name: 'Tests'}))
    const running = await screen.findByRole('tabpanel', {name: 'Tests'})
    expect(await within(running).findByText('Running tests: 1 passed, 1 failed, 0 skipped')).toBeVisible()
  })

  test('a run stopped from outside ends in the tab with the results it had, and the agent gets those results', async () => {
    const user = userEvent.setup()
    const engine = await createEngine(
      {plugins: ['@conciv/plugin-test-runner']},
      {directory: 'test/fixtures/greenhouse'},
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Tests'}))
    const panel = await screen.findByRole('tabpanel', {name: 'Tests'})
    const run = engine.rpc.call('test-runner', 'run', {})
    expect(await within(panel).findByText('Running tests: 1 passed, 1 failed, 0 skipped')).toBeVisible()

    expect(await engine.rpc.call('test-runner', 'stop')).toEqual({ok: true})
    expect(await within(panel).findByText('Test run finished: 1 passed, 1 failed, 0 skipped')).toBeVisible()
    expect(within(panel).queryByText(/^Running tests/)).not.toBeInTheDocument()
    const failing = within(panel).getByRole('region', {name: '1 failing test'})
    expect(within(failing).getByText('the pruned rose blooms')).toBeVisible()
    expect(await run).toMatchObject({
      summary: {passed: 1, failed: 1, skipped: 0},
      failures: [{name: 'the pruned rose blooms'}],
    })
  })

  test('after the engine connection drops and comes back, the tab reads the status again', async () => {
    const user = userEvent.setup()
    const engine = await createEngine(
      {plugins: ['@conciv/plugin-test-runner']},
      {directory: 'test/fixtures/greenhouse'},
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('tab', {name: 'Tests'}))
    const panel = await screen.findByRole('tabpanel', {name: 'Tests'})
    await engine.rpc.call('test-runner', 'run', {patterns: ['beds']})
    expect(await within(panel).findByText('Test run finished: 1 passed, 1 failed, 0 skipped')).toBeVisible()

    await engine.restart()

    expect(await screen.findByText('No test run yet')).toBeVisible()
    const reconnected = screen.getByRole('tabpanel', {name: 'Tests'})
    expect(within(reconnected).queryByText(/^Test run finished/)).not.toBeInTheDocument()
  })
})

describe('the run in the thread', () => {
  test('the finished run and the last status show as cards, and Fix this on a card fills the composer', async () => {
    const user = userEvent.setup()
    const engine = await createEngine(
      {plugins: ['@conciv/plugin-test-runner']},
      {directory: 'test/fixtures/plant-shop'},
    )
    await engine.reply(
      TestLLM.toolCall('c1', 'test_runner_run', {}),
      TestLLM.toolCall('c2', 'test_runner_status', {}),
      TestLLM.text('One test fails'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Run the tests')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Run the tests'})
    expect(await within(reply).findByText('One test fails')).toBeVisible()

    const [ran, read] = within(within(reply).getByRole('list', {name: 'Execution trace'})).getAllByRole('listitem')
    assert(ran !== undefined && read !== undefined)
    expect(within(ran).getByRole('button', {name: /Ran the tests/})).toBeVisible()
    expect(within(ran).getByRole('status')).toMatchTextContent('Test run finished: 1 passed, 1 failed, 0 skipped')
    expect(within(ran).getByText('plant-shop/cart.test.js')).toBeVisible()
    expect(within(ran).getByText('a fern in the cart costs 12')).toBeVisible()
    const discount = within(ran).getByRole('group', {name: 'the spring discount takes 10 off'})
    expect(within(discount).getByText('expected 11 to be 2 // Object.is equality')).not.toBeVisible()
    await user.click(within(discount).getByText('the spring discount takes 10 off'))
    expect(await within(discount).findByText('expected 11 to be 2 // Object.is equality')).toBeVisible()
    await user.click(within(ran).getByRole('button', {name: 'Fix this'}))
    const input = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    expect(input).toMatchTextContent('The test "the spring discount takes 10 off" in discount.test.js is failing:')
    expect(input).toMatchTextContent('expected 11 to be 2 // Object.is equality')

    expect(within(read).getByRole('button', {name: /Read the last test run/})).toBeVisible()
    expect(within(read).getByRole('status')).toMatchTextContent('Test run finished: 1 passed, 1 failed, 0 skipped')
  })
})

describe('a project with no vitest', () => {
  test('the agent hears why the runner cannot start, the card shows the reason, and the Tests tab says the runner could not start', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-test-runner']})
    await engine.reply(TestLLM.toolCall('c1', 'test_runner_run', {}), TestLLM.text('Vitest is not installed'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Run the tests')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Run the tests'})
    expect(await within(reply).findByText('Vitest is not installed')).toBeVisible()
    const [, answer] = await engine.requests()
    const result = answer?.messages.find((message) => message.toolCallId === 'c1')
    expect(String(result?.content)).toContain("vitest unavailable: Cannot find module 'vitest/node'")

    await user.click(within(reply).getByRole('button', {name: /Vitest unavailable/}))
    expect(await within(reply).findByText(/vitest unavailable: Cannot find module 'vitest\/node'/)).toBeVisible()

    await user.click(screen.getByRole('tab', {name: 'Tests'}))
    const tests = await screen.findByRole('tabpanel', {name: 'Tests'})
    expect(await within(tests).findByText("The project's test runner could not start")).toBeVisible()
    expect(within(tests).getByText('The test runner is unavailable')).toBeVisible()
    expect(within(tests).getByText(/vitest unavailable: Cannot find module 'vitest\/node'/)).toBeVisible()
    expect(await engine.rpc.failure('test-runner', 'run', {})).toMatchObject({
      type: 'UNAVAILABLE',
      data: {available: false, error: expect.stringContaining("vitest unavailable: Cannot find module 'vitest/node'")},
    })
  })
})
