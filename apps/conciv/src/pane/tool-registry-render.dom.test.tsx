import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the agent asks a choice', () => {
  test('the user picks one of the offered answers and the agent goes on with it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'choices', question: 'Which color?', options: ['Red', 'Blue']})",
      }),
      TestLLM.text('Blue it is'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Pick a color with me')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Which color?')).toBeVisible()
    expect(screen.getByText('Rendered choices')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Blue'}))

    expect(await screen.findByText('Blue it is')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Pick a color with me'})
    expect(within(reply).getByText('Blue')).toBeVisible()
    expect(within(reply).queryByRole('button', {name: 'Red'})).not.toBeInTheDocument()
    const answer = (await engine.requests()).at(-1)?.messages.at(-1)
    expect(answer?.role).toBe('tool')
    expect(answer?.content).toContain('"value":"Blue"')
  })
})

describe('the user stops while the agent asks', () => {
  test('the open question ends as interrupted at once and stays so after the next reply', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'choices', question: 'Which color?', options: ['Red', 'Blue']})",
      }),
      TestLLM.text('Here it is'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Pick a color with me')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByRole('button', {name: 'Red'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    expect(await screen.findByText('Tool execution interrupted')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Red'})).not.toBeInTheDocument()
    expect(screen.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Never mind')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Here it is')).toBeVisible()
    await user.click(screen.getByRole('button', {name: /Show trace/}))
    expect(await screen.findByText('Tool execution interrupted')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Red'})).not.toBeInTheDocument()
    expect(screen.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()
  })
})

describe('a plugin draws its own tool cards', () => {
  test('a plugin card shows open, a failed call draws the plugin error card, and a card that throws falls back to the generic card', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_check({branch: 'main'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: "return await external_release_block({branch: 'main'})",
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: "return await external_release_notes({branch: 'main'})",
      }),
      TestLLM.text('Main is checked'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Can main ship')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('Main is checked')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Can main ship'})
    expect(within(reply).getByText('Release card for main')).toBeVisible()
    expect(within(reply).getByText(/^Release held: .*The release train is frozen/)).toBeVisible()
    expect(within(reply).getByRole('button', {name: /Called release_notes/})).toBeVisible()
  })
})

describe('a plugin fills the session header and status', () => {
  test('the header slot and the status slot show what the plugin draws', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    expect(await screen.findByText('Release train: on time')).toBeVisible()
    expect(await screen.findByText('Next train at noon')).toBeVisible()
  })
})
