import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {mount, pluginEngine} from '@conciv/plugin-testkit/browser'
import recorder from './plugin-experimental.js'

describe('the recorder without the page plugin', () => {
  test('the Recorder tab says it waits for the page, and a pull with nothing recorded shows its window on the card', async () => {
    const user = userEvent.setup()
    const engine = await pluginEngine({plugins: ['@conciv/plugin-recorder']})
    const pulled = await engine.tool('recording_pull').answer({secondsBack: 30, keyframes: 0})
    await mount(recorder, {
      id: '@conciv/plugin-recorder',
      engine,
      tools: [
        {
          tool: 'recording_pull',
          input: {secondsBack: 30, keyframes: 0},
          metadata: {},
          status: 'completed',
          output: JSON.stringify(pulled.content),
        },
      ],
    })

    await user.click(await screen.findByRole('tab', {name: 'Recorder'}))
    const panel = await screen.findByRole('tabpanel', {name: 'Recorder'})
    expect(await within(panel).findByText('Waiting for the page: nothing is recorded until it connects.')).toBeVisible()
    const shell = screen.getByRole('main', {name: 'App shell'})
    expect(within(shell).getByText('recording_pull')).toBeVisible()
    expect(within(shell).getByText('last 30s · 0 actions · 0 keyframes')).toBeVisible()
  })
})
