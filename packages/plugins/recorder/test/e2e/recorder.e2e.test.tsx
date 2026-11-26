import {describe, expect, test} from 'vitest'
import {userEvent as realInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createFakeEngine, FakeLLM} from '@conciv/client/testing'
import {useFakeEngine} from '@internal/frontend-test-utils'
import {renderTestApp, servePluginBundle} from '@internal/frontend-test-utils/app'
import pagePlugin from '@conciv/plugin-page/renderer'
import {Definition as PageDefinition} from '@conciv/plugin-page/rpc'
import {distill} from '../../src/distill.js'
import {recordingParts} from '../../src/format.js'
import {createFakeRecorder, RECORDER_BUILD} from '../utils/fake-recorder.js'

describe('the user records the page and sends it to the agent', () => {
  test('the Recorder tab replays the page live with the widget left out and typing masked, sends a screen recording note, and the note replays, says when there is nothing to replay and when the recording is gone', async () => {
    const user = userEvent.setup()
    const session = 'ses_checkout'
    const recorder = createFakeRecorder({masking: 'inputs', windowMinutes: 10, console: true})
    const engine = useFakeEngine(
      createFakeEngine(
        servePluginBundle(
          {...RECORDER_BUILD, options: {masking: 'inputs'}},
          {
            sessions: [{id: session, title: 'Checkout'}],
            plugins: {
              recorder: recorder.handlers,
              [PageDefinition.id]: {
                attach: (_input, call) =>
                  new Promise((resolve) =>
                    call.signal?.addEventListener('abort', () => resolve('closed'), {once: true}),
                  ),
              },
            },
          },
        ),
      ),
    )
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
    engine.reply(FakeLLM.text('You typed a card number and paid'))
    await renderTestApp({
      engine,
      plugins: [{id: 'conciv.page', plugin: pagePlugin}],
      initialEntries: [`/panel/${session}/recorder:recorder?open=true`],
    })

    expect(await screen.findByRole('tab', {name: 'Recorder', selected: true})).toBeVisible()
    expect(await screen.findByText('LIVE')).toBeVisible()
    expect(cardNumber).toHaveFocus()
    await realInput.type(cardNumber, '4242')
    await realInput.click(screen.getByRole('button', {name: 'Pay now'}))
    await user.click(screen.getByRole('button', {name: 'Send to agent'}))

    expect(await screen.findByText('Screen recording')).toBeVisible()
    expect(within(screen.getByRole('list', {name: 'Notes'})).getByText('Screen recording')).toBeVisible()
    const input = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'What did I do on the page?')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('You typed a card number and paid')).toBeVisible()
    const recordingId = [...recorder.recordings.keys()].at(-1) ?? ''
    expect(JSON.stringify(engine.sent().at(-1)?.messages)).toContain(
      `The user referenced the screen recording ${recordingId}`,
    )
    const flushed = JSON.stringify(recorder.flushed())
    expect(flushed).not.toContain('4242')
    const log = recordingParts(distill([...recorder.flushed()]), [], false).output
    expect(log).toContain('[input] typed "****" into input')
    expect(log).toContain('[click] clicked button "Pay now"')
    expect(log).not.toContain('Send to agent')

    await user.click(screen.getByRole('button', {name: 'Play'}))
    const replay = await screen.findByRole('dialog', {name: 'Screen recording replay'})
    expect(within(replay).getByText(/^\d+ actions? · \d+s$/)).toBeVisible()
    await user.click(within(replay).getByRole('button', {name: 'Close'}))

    recorder.recordings.set(recordingId, {kind: 'found', events: []})
    await user.click(screen.getByRole('button', {name: 'Play'}))
    expect(await screen.findByText('Nothing to replay in this recording.')).toBeVisible()
    const empty = await screen.findByRole('dialog', {name: 'Screen recording replay'})
    expect(replay).not.toBeInTheDocument()
    expect(within(empty).getByText('Nothing to replay in this recording.')).toBeVisible()
    await user.click(within(empty).getByRole('button', {name: 'Close'}))

    recorder.recordings.set(recordingId, {kind: 'missing'})
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
    const log = '+0.4s [click] clicked button "Pay now"'
    const recorder = createFakeRecorder({masking: 'inputs', windowMinutes: 10, console: true})
    const engine = useFakeEngine(
      createFakeEngine(servePluginBundle(RECORDER_BUILD, {plugins: {recorder: recorder.handlers}})),
    )
    engine.reply(
      FakeLLM.toolCall('c1', 'recording_start', {}, {captureId: 'cap_1'}),
      FakeLLM.toolCall('c2', 'recording_stop', {captureId: 'cap_1', keyframes: 0}, [{type: 'text', content: log}]),
      FakeLLM.toolCall('c3', 'recording_pull', {secondsBack: 30, keyframes: 0}, [{type: 'text', content: log}]),
      FakeLLM.toolCall('c4', 'recording_get', {recordingId: 'rec_saved'}, [{type: 'text', content: log}]),
      FakeLLM.text('The page recorded nothing unusual'),
    )
    await renderTestApp({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Record the checkout')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('The page recorded nothing unusual')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Record the checkout'})
    expect(within(reply).getByText('recording_start')).toBeVisible()
    expect(within(reply).getByText('capture started')).toBeVisible()
    expect(within(reply).getByText('recording_stop')).toBeVisible()
    expect(within(reply).getByText('1 action · 0 keyframes')).toBeVisible()
    expect(within(reply).getByText('recording_pull')).toBeVisible()
    expect(within(reply).getByText('last 30s · 1 action · 0 keyframes')).toBeVisible()
    expect(within(reply).getByText('Called recording_get')).toBeVisible()
  })
})
