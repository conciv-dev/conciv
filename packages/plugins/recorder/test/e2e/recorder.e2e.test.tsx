import {describe, expect, test} from 'vitest'
import {userEvent as realInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {z} from 'zod'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the user records the page and sends it to the agent', () => {
  test('the Recorder tab replays the page live with the widget left out and typing masked, sends a screen recording note, and the note replays from the thread', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [['@conciv/plugin-recorder', {masking: 'inputs'}]]})
    await engine.reply(TestLLM.text('You typed a card number and paid'))
    render(() => (
      <form>
        <label>
          Card number
          <input />
        </label>
        <button type="button">Pay now</button>
      </form>
    ))
    const cardNumber = screen.getByRole('textbox', {name: 'Card number'})
    await realInput.click(cardNumber)
    expect(cardNumber).toHaveFocus()
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}/recorder:recorder?open=true`]}),
    })

    expect(await screen.findByRole('tab', {name: 'Recorder', selected: true})).toBeVisible()
    expect(await screen.findByText('LIVE')).toBeVisible()
    expect(cardNumber).toHaveFocus()
    await realInput.type(cardNumber, '4242')
    await realInput.click(screen.getByRole('button', {name: 'Pay now'}))
    await user.click(screen.getByRole('button', {name: 'Send to agent'}))

    expect(await screen.findByText('Screen recording')).toBeVisible()
    const input = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'What did I do on the page?')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('You typed a card number and paid')).toBeVisible()

    const [request] = await engine.requests()
    const recordingId = z
      .string()
      .parse(
        /The user referenced the screen recording (\S+) \(Screen recording · /.exec(
          JSON.stringify(request?.messages),
        )?.[1],
      )
    const log = z.string().parse(await engine.session.tool('recording_get').call({recordingId, keyframes: 0}))
    expect(log).toContain('[input] typed "****" into input')
    expect(log).toContain('[click] clicked button "Pay now"')
    expect(log).not.toContain('Send to agent')

    await user.click(screen.getByRole('button', {name: 'Play'}))
    const replay = await screen.findByRole('dialog', {name: 'Screen recording replay'})
    expect(within(replay).getByText(/^\d+ actions? · \d+s$/)).toBeVisible()
    await user.click(within(replay).getByRole('button', {name: 'Close'}))

    await engine.write(`.conciv/recorder/recordings/${recordingId}.json`, '{"events": []}')
    await user.click(screen.getByRole('button', {name: 'Play'}))
    expect(await screen.findByText('Nothing to replay in this recording.')).toBeVisible()
    const empty = await screen.findByRole('dialog', {name: 'Screen recording replay'})
    expect(replay).not.toBeInTheDocument()
    expect(within(empty).getByText('Nothing to replay in this recording.')).toBeVisible()
    await user.click(within(empty).getByRole('button', {name: 'Close'}))

    await engine.write(`.conciv/recorder/recordings/${recordingId}.json`, 'not a recording')
    await user.click(screen.getByRole('button', {name: 'Play'}))
    expect(await screen.findByText('Recording not found: it is no longer saved in this project.')).toBeVisible()
    const gone = await screen.findByRole('dialog', {name: 'Screen recording replay'})
    expect(empty).not.toBeInTheDocument()
    expect(within(gone).getByText('Recording not found: it is no longer saved in this project.')).toBeVisible()
  })
})

describe('the agent records during a reply', () => {
  test('the agent starts, stops and pulls a recording with a card for each, and reading a saved recording shows on the default card', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-recorder']})
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })
    render(() => <button type="button">Pay now</button>)
    const {captureId} = z.object({captureId: z.string()}).parse(await engine.session.tool('recording_start').call({}))
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {typescriptCode: 'return await external_recording_start({})'}),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: `return await external_recording_stop({captureId: '${captureId}', keyframes: 0})`,
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: 'return await external_recording_pull({secondsBack: 30, keyframes: 0})',
      }),
      TestLLM.toolCall('c4', 'execute_typescript', {
        typescriptCode: "return await external_recording_get({recordingId: 'no-such-recording'})",
      }),
      TestLLM.text('The page recorded nothing unusual'),
    )

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Record the checkout')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('The page recorded nothing unusual')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Record the checkout'})
    expect(within(reply).getByText('recording_start')).toBeVisible()
    expect(within(reply).getByText('capture started')).toBeVisible()
    expect(within(reply).getByText('recording_stop')).toBeVisible()
    expect(within(reply).getByText(/^\d+ actions? · 0 keyframes$/)).toBeVisible()
    expect(within(reply).getByText('recording_pull')).toBeVisible()
    expect(within(reply).getByText(/^last 30s · \d+ actions? · 0 keyframes$/)).toBeVisible()
    expect(within(reply).getByText('recording_get')).toBeVisible()
  })
})
