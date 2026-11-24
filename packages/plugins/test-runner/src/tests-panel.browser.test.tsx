import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {mount, pluginEngine} from '@conciv/plugin-testkit/browser'
import runner from './plugin-experimental.js'

describe('the Tests tab', () => {
  test('the tab says no run yet, shows a finished run with its failure, Fix this fills the composer, and the tab and the card follow the run the agent starts', async () => {
    const user = userEvent.setup()
    const engine = await pluginEngine({
      plugins: ['@conciv/plugin-test-runner'],
      directory: 'test/fixtures/greenhouse',
    })
    await mount(runner, {
      id: '@conciv/plugin-test-runner',
      engine,
      tools: [{tool: 'test_runner_run', input: {}, metadata: {}, status: 'running', defaultOpen: true}],
    })

    await user.click(await screen.findByRole('tab', {name: 'Tests'}))
    const panel = await screen.findByRole('tabpanel', {name: 'Tests'})
    expect(await within(panel).findByText('No test run yet')).toBeVisible()
    expect(
      within(panel).getByText('Ask the agent to run the tests; the results show here as they come in.'),
    ).toBeVisible()

    await engine.call('test-runner', 'run', {patterns: ['beds']})
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
    const input = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    expect(input).toHaveValue(
      expect.stringContaining('The test "the pruned rose blooms" in beds/pruning.test.js is failing:'),
    )
    expect(input).toHaveValue(expect.stringContaining('expected 3 to be 4 // Object.is equality'))

    const agentRun = engine.tool('test_runner_run').call({pattern: 'watering'})
    expect(await screen.findByText(/^Test run in progress/)).toBeVisible()
    const running = await screen.findByRole('tabpanel', {name: 'Tests'})
    expect(await within(running).findByText(/^Running tests/)).toBeVisible()
    expect(await engine.call('test-runner', 'stop')).toEqual({ok: true})
    expect(await agentRun).toMatchObject({summary: {passed: 0, failed: 0, skipped: 0}})
  })

  test('a run stopped from outside ends in the tab with the results it had, and the agent gets those results', async () => {
    const user = userEvent.setup()
    const engine = await pluginEngine({
      plugins: ['@conciv/plugin-test-runner'],
      directory: 'test/fixtures/greenhouse',
    })
    await mount(runner, {id: '@conciv/plugin-test-runner', engine})

    await user.click(await screen.findByRole('tab', {name: 'Tests'}))
    const panel = await screen.findByRole('tabpanel', {name: 'Tests'})
    const run = engine.call('test-runner', 'run', {})
    expect(await within(panel).findByText('Running tests: 1 passed, 1 failed, 0 skipped')).toBeVisible()

    expect(await engine.call('test-runner', 'stop')).toEqual({ok: true})
    expect(await within(panel).findByText('Test run finished: 1 passed, 1 failed, 0 skipped')).toBeVisible()
    expect(within(panel).queryByText(/^Running tests/)).not.toBeInTheDocument()
    const failing = within(panel).getByRole('region', {name: '1 failing test'})
    expect(within(failing).getByText('the pruned rose blooms')).toBeVisible()
    expect(await run).toMatchObject({
      summary: {passed: 1, failed: 1, skipped: 0},
      failures: [{name: 'the pruned rose blooms'}],
    })
  })
})

describe('the run in the thread', () => {
  test('the finished run and the last status show as cards, and Fix this on a card fills the composer', async () => {
    const user = userEvent.setup()
    const engine = await pluginEngine({
      plugins: ['@conciv/plugin-test-runner'],
      directory: 'test/fixtures/plant-shop',
    })
    const ran = await engine.tool('test_runner_run').call()
    const read = await engine.tool('test_runner_status').call()
    await mount(runner, {
      id: '@conciv/plugin-test-runner',
      engine,
      tools: [
        {tool: 'test_runner_run', input: {}, metadata: {}, status: 'completed', output: JSON.stringify(ran)},
        {tool: 'test_runner_status', input: {}, metadata: {}, status: 'completed', output: JSON.stringify(read)},
      ],
    })

    const shell = screen.getByRole('main', {name: 'App shell'})
    await user.click(await within(shell).findByRole('button', {name: /Ran the tests/}))
    expect(within(shell).getByText('Test run finished: 1 passed, 1 failed, 0 skipped')).toBeVisible()
    expect(within(shell).getByText('plant-shop/cart.test.js')).toBeVisible()
    expect(within(shell).getByText('a fern in the cart costs 12')).toBeVisible()
    const discount = within(shell).getByRole('group', {name: 'the spring discount takes 10 off'})
    expect(within(discount).getByText('expected 11 to be 2 // Object.is equality')).not.toBeVisible()
    await user.click(within(discount).getByText('the spring discount takes 10 off'))
    expect(await within(discount).findByText('expected 11 to be 2 // Object.is equality')).toBeVisible()
    await user.click(within(discount).getByRole('button', {name: 'Fix this'}))
    const input = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    expect(input).toHaveValue(
      expect.stringContaining('The test "the spring discount takes 10 off" in discount.test.js is failing:'),
    )
    expect(input).toHaveValue(expect.stringContaining('expected 11 to be 2 // Object.is equality'))

    await user.click(within(shell).getByRole('button', {name: /Read the last test run/}))
    expect(within(shell).getAllByText('Test run finished: 1 passed, 1 failed, 0 skipped')).toHaveLength(2)
  })
})

describe('a project with no vitest', () => {
  test('the agent hears why the runner cannot start, the card shows the reason, and the Tests tab says the runner could not start', async () => {
    const user = userEvent.setup()
    const engine = await pluginEngine({plugins: ['@conciv/plugin-test-runner']})
    const refused = await engine.tool('test_runner_run').failure()
    expect(refused.message).toContain("vitest unavailable: Cannot find module 'vitest/node'")
    await mount(runner, {
      id: '@conciv/plugin-test-runner',
      engine,
      tools: [{tool: 'test_runner_run', input: {}, metadata: {}, status: 'error', error: refused.message}],
    })

    const shell = screen.getByRole('main', {name: 'App shell'})
    expect(await within(shell).findByText('The test runner is unavailable')).toBeVisible()
    expect(within(shell).getByText(/vitest unavailable: Cannot find module 'vitest\/node'/)).toBeVisible()

    await user.click(screen.getByRole('tab', {name: 'Tests'}))
    const tests = await screen.findByRole('tabpanel', {name: 'Tests'})
    expect(await within(tests).findByText("The project's test runner could not start")).toBeVisible()
    expect(within(tests).getByText('The test runner is unavailable')).toBeVisible()
    expect(within(tests).getByText(/vitest unavailable: Cannot find module 'vitest\/node'/)).toBeVisible()
    expect(await engine.failure('test-runner', 'run', {})).toMatchObject({
      type: 'UNAVAILABLE',
      data: {available: false, error: expect.stringContaining("vitest unavailable: Cannot find module 'vitest/node'")},
    })
  })
})
