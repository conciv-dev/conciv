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
    expect(screen.getByRole('status', {name: 'Agent activity'})).toMatchTextContent('conciv_ui')
    expect(screen.getAllByRole('img', {name: 'running'}).at(-1)).toBeVisible()
    expect(screen.queryByRole('img', {name: 'complete'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Blue'}))

    expect(await screen.findByText('Blue it is')).toBeVisible()
    expect(screen.queryByRole('status', {name: 'Agent activity'})).not.toBeInTheDocument()
    expect(screen.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()
    expect(screen.getAllByRole('img', {name: 'complete'}).at(-1)).toBeVisible()
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

describe('opening a tool card while the turn goes on', () => {
  test('the user opens the card of a tool with no card of its own, its body shows, and it stays open when the answer arrives', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_release_window({branch: 'main'})",
      }),
      TestLLM.text('The window is set'),
    )
    const toolCall = await engine.gate()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'When can we ship')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await toolCall.started
    const answer = await engine.gate()
    await toolCall.release()
    await answer.started
    const reply = await screen.findByRole('article', {name: 'Reply to: When can we ship'})
    expect(await within(reply).findAllByText('"noon to two"')).toHaveLength(1)
    await user.click(within(reply).getByRole('button', {name: /Called release_window/}))
    const opened = await within(reply).findAllByText('"noon to two"')
    expect(opened).toHaveLength(2)
    expect(opened.at(-1)).toBeVisible()

    await answer.release()
    expect(await screen.findByText('The window is set')).toBeVisible()
    expect(within(reply).getAllByText('"noon to two"')).toHaveLength(2)
    expect(within(reply).getAllByText('"noon to two"').at(-1)).toBeVisible()
    const durations = await within(reply).findAllByText(/^\d+\.\ds$/)
    expect(durations.at(-1)).toBeVisible()
  })
})

describe('the agent asks other kinds of question', () => {
  test('a multi-select question submits the pressed options and a typed other, and Submit waits for a choice', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'choices', question: 'Which toppings?', options: ['Olives', 'Basil', 'Garlic'], multiSelect: true, allowOther: true})",
      }),
      TestLLM.text('Pizza ordered'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Order a pizza')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Which toppings?')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Submit'})).toBeDisabled()
    await user.click(screen.getByRole('button', {name: 'Olives'}))
    await user.click(screen.getByRole('button', {name: 'Basil'}))
    await user.click(screen.getByRole('button', {name: 'Olives'}))
    expect(screen.getByRole('button', {name: 'Basil', pressed: true})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Olives', pressed: false})).toBeVisible()
    await user.type(screen.getByRole('textbox', {name: 'Other'}), 'Chili')
    await user.click(screen.getByRole('button', {name: 'Submit'}))

    expect(await screen.findByText('Pizza ordered')).toBeVisible()
    const answer = (await engine.requests()).at(-1)?.messages.at(-1)
    expect(answer?.role).toBe('tool')
    expect(answer?.content).toContain('"value":["Basil","Chili"]')
  })

  test('a confirm question shows its detail and Approve answers yes', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'confirm', question: 'Delete the build folder?', detail: 'rm -r dist'})",
      }),
      TestLLM.text('Build folder deleted'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Clean the build')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Delete the build folder?')).toBeVisible()
    expect(await screen.findByText('rm -r dist')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Deny'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Approve'}))

    expect(await screen.findByText('Build folder deleted')).toBeVisible()
    expect((await engine.requests()).at(-1)?.messages.at(-1)?.content).toContain('"value":"yes"')
  })

  test('a diff question shows the change and Reject answers reject', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'diff', question: 'Apply this change?', file: 'src/title.ts', before: 'export const title = 1', after: 'export const title = 2'})",
      }),
      TestLLM.text('Change dropped'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Bump the title')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Apply this change?')).toBeVisible()
    expect(await screen.findByText('src/title.ts')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Apply'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Reject'}))

    expect(await screen.findByText('Change dropped')).toBeVisible()
    expect((await engine.requests()).at(-1)?.messages.at(-1)?.content).toContain('"value":"reject"')
  })

  test('a form question sends the typed text and the first select option by default, and shows the answers', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "return await external_conciv_ui({kind: 'form', title: 'New page', fields: [{name: 'path', label: 'Path', type: 'text'}, {name: 'layout', label: 'Layout', type: 'select', options: ['Wide', 'Narrow']}]})",
      }),
      TestLLM.text('Page created'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Make a page')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await user.type(await screen.findByRole('textbox', {name: 'Path'}), '/pricing')
    expect(screen.getByRole('combobox', {name: 'Layout'})).toMatchTextContent('Wide')
    await user.click(screen.getByRole('button', {name: 'Submit'}))

    expect(await screen.findByText('Page created')).toBeVisible()
    expect((await engine.requests()).at(-1)?.messages.at(-1)?.content).toContain(
      '"value":{"path":"/pricing","layout":"Wide"}',
    )
    const reply = screen.getByRole('article', {name: 'Reply to: Make a page'})
    expect(within(reply).getByText('/pricing')).toBeVisible()
  })
})

describe('an outside agent calls a tool', () => {
  test('the call shows in the open thread tagged with the agent that made it, and the agent gets the result', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    const reply = await engine.outside({client: 'conciv-test'}).call('release_window', {branch: 'main'})

    expect(reply).toMatchObject({content: [{type: 'text', text: expect.stringContaining('noon to two')}]})
    expect(await screen.findByText('from conciv-test')).toBeVisible()
    expect(screen.queryByRole('article', {name: /^You:/})).not.toBeInTheDocument()
  })
})

describe('the agent opens a file in the editor', () => {
  test('the open card names the file and line and says it opened, and the editor gets the file at that line', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_server_open({file: 'src/app.ts', line: 12})",
      }),
      TestLLM.text('It is open'),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Show me the app file')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('It is open')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Show me the app file'})
    expect(within(reply).getByText('Open in editor')).toBeVisible()
    expect(within(reply).getByText('src/app.ts:12')).toBeVisible()
    expect(within(reply).getByText('Opened in your editor.')).toBeVisible()
    expect(await engine.opened()).toEqual([{file: 'src/app.ts', line: 12}])
  })
})
