import {describe, expect, test} from 'vitest'
import {render, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the agent acts on the page during a reply', () => {
  test('the click and the restyle fold into one card, and the screenshot reaches the agent as an image', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_click({selector: '#buy'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_page_setstyle({selector: '#buy', prop: 'color', value: 'red'})",
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {typescriptCode: 'return await external_page_screenshot({})'}),
      TestLLM.text('The button is red now'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))

    expect(await screen.findByText('The button is red now')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Explain this page'})
    expect(within(reply).getByText('Edited the page')).toBeVisible()
    expect(within(reply).getByText('2 actions')).toBeVisible()
    expect(within(reply).getByText('Clicked')).toBeVisible()
    expect(within(reply).getByText('Styled an element')).toBeVisible()
    expect(within(reply).getAllByText('#buy')).toHaveLength(2)
    expect(within(reply).getByRole('img', {name: 'Took a screenshot'})).toBeVisible()
    const [, , , answer] = await engine.requests()
    const shot = answer?.messages.find((message) => message.toolCallId === 'c3')
    expect(JSON.parse(String(shot?.content))).toMatchObject({
      files: [{type: 'image', source: {type: 'data', mimeType: 'image/webp'}}],
    })
  })
})

describe('the user stops the agent from the page', () => {
  test('two clicks on the page while the agent works stop the reply', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const control = await engine.event('rpc.experimental.page.control')
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_page_click({selector: '#buy'})",
      }),
      TestLLM.text('Never shown'),
    )
    const click = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await control.arrived
    render(() => (
      <button type="button" id="buy">
        Buy the fern
      </button>
    ))

    await user.click(await screen.findByRole('button', {name: 'Explain this page'}))
    await click.started
    const answer = await engine.gate()
    await click.release()
    await answer.started
    const mask = await screen.findByRole('status', {name: 'Agent is using this page'})
    await user.click(mask)
    await user.click(mask)

    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    await answer.release()
    expect(screen.queryByText('Never shown')).not.toBeInTheDocument()
  })
})
