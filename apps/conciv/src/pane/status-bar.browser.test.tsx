import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the session status chip', () => {
  test('a fresh session shows no chip, a run shows RUNNING and RUNNING 1/2 with a queued message, then DONE, and a failed run shows FAILED with its reason', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.text('First answer'),
      TestLLM.text('Second answer'),
      TestLLM.failAfter(new Error('The model is unavailable')),
    )
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    expect(within(bar).queryByRole('status')).not.toBeInTheDocument()
    expect(within(bar).getByText('--')).toBeVisible()

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    expect(await within(bar).findByRole('status')).toHaveTextContent('RUNNING')

    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await within(bar).findByText('RUNNING 1/2')).toBeVisible()

    await gate.release()
    const second = await screen.findByRole('article', {name: 'Reply to: Second task'})
    expect(await within(second).findByText('Second answer')).toBeVisible()
    expect(await within(bar).findByText('DONE')).toBeVisible()
    expect(within(bar).getByText(/^\d{2}:\d{2}$/)).toBeVisible()
    expect(within(bar).queryByText('--')).not.toBeInTheDocument()

    await user.type(input, 'Third task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert', {name: 'The model is unavailable'})).toBeVisible()
    const failed = await within(bar).findByRole('status')
    expect(failed).toHaveTextContent('FAILED')
    expect(failed).toHaveAccessibleDescription('The model is unavailable')
  })

  test('an edit that failed changed no file, so the status bar counts no files or lines', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'Edit', {file_path: 'src/app.ts', old_string: 'one', new_string: 'two\nthree'}),
      TestLLM.text('The edit did not go through'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Change the app')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('The edit did not go through')).toBeVisible()
    expect(await within(bar).findByText('DONE')).toBeVisible()

    expect(within(bar).queryByText('1 file')).not.toBeInTheDocument()
    expect(within(bar).queryByText('+2')).not.toBeInTheDocument()
    expect(within(bar).queryByText('−1')).not.toBeInTheDocument()
  })

  test('a Stop while the reply is held shows STOPPING and Stopping… until the run ends, then STOPPED', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Too late'))
    const gate = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Take your time')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started
    await user.click(await screen.findByRole('button', {name: 'Stop generating'}))

    expect(await within(bar).findByText('STOPPING')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Stopping the run'})).toBeVisible()

    await gate.release()
    expect(await within(bar).findByText('STOPPED')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Stopping the run'})).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Send message'})).toBeVisible()
  })
  test('while a permission card is open the chip says WAITING and no activity line names the call a second time', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_ship({branch: 'main'})",
      }),
      TestLLM.text('Main is shipped'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship main')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    expect(await within(bar).findByText('WAITING')).toBeVisible()
    expect(screen.queryByRole('status', {name: 'Agent activity'})).not.toBeInTheDocument()

    await user.click(within(ask).getByRole('button', {name: 'Allow once'}))
    expect(await screen.findByText('Main is shipped')).toBeVisible()
    expect(await within(bar).findByText('DONE')).toBeVisible()
  })
})
