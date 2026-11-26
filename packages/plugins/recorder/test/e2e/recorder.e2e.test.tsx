import {describe, expect} from 'vitest'
import {userEvent as realInput} from 'vitest/browser'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {z} from 'zod'
import {test, TestLLM} from '@conciv/backend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import {pageTestPlugin} from '@conciv/plugin-page/test-utils'
import {distill} from '../../src/distill.js'
import {recordingParts} from '../../src/format.js'
import {RrwebEventSchema} from '../../src/rpc.js'

describe('the user records the page and sends it to the agent', () => {
  test('the Recorder tab replays the page live with the widget left out and typing masked, sends a screen recording note, and the note replays, says when there is nothing to replay and when the recording is gone', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const engine = await createEngine(
      {plugins: [['@conciv/plugin-recorder', {masking: 'inputs', windowMinutes: 10, console: true}]]},
      {plugins: ['@conciv/plugin-page']},
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
    await engine.reply(TestLLM.text('You typed a card number and paid'))
    await renderTestApp({
      engine,
      plugins: [pageTestPlugin],
      initialEntries: [`/panel/${engine.session.id}/recorder:recorder?open=true`],
    })

    expect(await screen.findByRole('tab', {name: 'Recorder', selected: true})).toBeVisible()
    expect(await screen.findByText('LIVE')).toBeVisible()
    expect(within(screen.getByRole('tab', {name: /^Chat/})).getByText('Chat')).toBeVisible()
    expect(cardNumber).toHaveFocus()
    await realInput.type(cardNumber, '4242')
    await realInput.click(screen.getByRole('button', {name: 'Pay now'}))
    await user.click(screen.getByRole('button', {name: 'Send to agent'}))

    expect(await screen.findByText('Screen recording')).toBeVisible()
    expect(within(screen.getByRole('list', {name: 'Notes'})).getByText('Screen recording')).toBeVisible()
    const input = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'What did I do on the page?')
    expect(input).toHaveFocus()
    const finished = await engine.event('session.execution.succeeded')
    await user.keyboard('{Enter}')

    await finished.arrived
    expect(await screen.findByText('You typed a card number and paid')).toBeVisible()
    const sent = JSON.stringify((await engine.requests()).at(-1)?.messages)
    const recordingId = /The user referenced the screen recording ([A-Za-z0-9-]+)/.exec(sent)?.[1] ?? ''
    expect(sent).toContain(`The user referenced the screen recording ${recordingId}`)
    const saved = z
      .object({kind: z.literal('found'), events: z.array(RrwebEventSchema)})
      .parse(await engine.rpc.call('recorder', 'recordings.get', {recordingId})).events
    const recordingFile = `.conciv/recorder/recordings/${recordingId}.json`
    expect(JSON.stringify(saved)).not.toContain('4242')
    const log = recordingParts(distill(saved), [], false).output
    expect(log).toContain('[input] typed "****" into input')
    expect(log).toContain('[click] clicked button "Pay now"')
    expect(log).not.toContain('Send to agent')

    await user.click(screen.getByRole('button', {name: 'Play'}))
    const replay = await screen.findByRole('dialog', {name: 'Screen recording replay'})
    expect(within(replay).getByText(/^\d+ actions? · \d+s$/)).toBeVisible()
    await user.click(within(replay).getByRole('button', {name: 'Close'}))

    await engine.write(recordingFile, JSON.stringify({events: []}))
    await user.click(screen.getByRole('button', {name: 'Play'}))
    expect(await screen.findByText('Nothing to replay in this recording.')).toBeVisible()
    const empty = await screen.findByRole('dialog', {name: 'Screen recording replay'})
    expect(replay).not.toBeInTheDocument()
    expect(within(empty).getByText('Nothing to replay in this recording.')).toBeVisible()
    await user.click(within(empty).getByRole('button', {name: 'Close'}))

    await engine.write(recordingFile, '')
    await user.click(screen.getByRole('button', {name: 'Play'}))
    expect(await screen.findByText('Recording not found: it is no longer saved in this project.')).toBeVisible()
    const gone = await screen.findByRole('dialog', {name: 'Screen recording replay'})
    expect(empty).not.toBeInTheDocument()
    expect(within(gone).getByText('Recording not found: it is no longer saved in this project.')).toBeVisible()
  })
})

describe('the agent records during a reply', () => {
  function recordingCall(id: string, tool: string, input: object) {
    return TestLLM.toolCall(id, 'execute_typescript', {
      typescriptCode: `return await external_recording_${tool}(${JSON.stringify(input)})`,
    })
  }

  test('the agent starts, stops and pulls a recording with a card for each, and reading a saved recording shows on the default card', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-recorder']}, {plugins: ['@conciv/plugin-page']})
    await engine.write(
      '.conciv/recorder/recordings/saved-checkout.json',
      JSON.stringify({
        events: [{type: 4, data: {href: 'http://localhost:5173/checkout', width: 800, height: 600}, timestamp: 1}],
      }),
    )
    render(() => <button type="button">Pay now</button>)
    const served = await engine.event('rpc.experimental.page.permissions.synced', {
      data: {sessionId: engine.session.id, allow: true},
    })
    await renderTestApp({engine, plugins: [pageTestPlugin]})
    await served.arrived
    const capture = z.object({captureId: z.string()}).parse(await engine.session.tool('recording_start').call({}))
    await realInput.click(screen.getByRole('button', {name: 'Pay now'}))
    await engine.reply(
      recordingCall('c1', 'start', {}),
      recordingCall('c2', 'stop', {captureId: capture.captureId, keyframes: 0}),
      recordingCall('c3', 'pull', {secondsBack: 30, keyframes: 0}),
      recordingCall('c4', 'get', {recordingId: 'saved-checkout', keyframes: 0}),
      TestLLM.text('The page recorded nothing unusual'),
    )

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Record the checkout')
    expect(input).toHaveFocus()
    const finished = await engine.event('session.execution.succeeded')
    await user.keyboard('{Enter}')

    await finished.arrived
    expect(await screen.findByText('The page recorded nothing unusual')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Record the checkout'})
    expect(within(reply).getByText('recording_start')).toBeVisible()
    expect(within(reply).getByText('capture started')).toBeVisible()
    expect(within(reply).getByText('recording_stop')).toBeVisible()
    expect(within(reply).getByText(/^\d+ actions? · 0 keyframes$/)).toBeVisible()
    expect(within(reply).getByText('recording_pull')).toBeVisible()
    expect(within(reply).getByText(/^last 30s · \d+ actions? · 0 keyframes$/)).toBeVisible()
    expect(within(reply).getByText('Called recording_get')).toBeVisible()
  })
})
