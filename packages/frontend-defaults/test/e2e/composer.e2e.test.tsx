import {describe, expect, it, onTestFinished, test} from 'vitest'
import {page} from 'vitest/browser'
import {fireEvent, screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {makeBrowserEngineConnection} from '@conciv/client'
import {FakeLLM, type FakeEngine} from '@conciv/client/testing'
import {test as engineTest} from '@conciv/backend-test-utils'
import drive from '../../src/drive/drive.js'
import {readSession, sentJson, sentTexts} from '../utils/engine-client.js'
import {mountShell} from '../utils/mount-shell.js'
import {composerEngine} from '../utils/sample-engines.js'
import {elsewhereSession, ENGINE_HARNESS, harness, mentionAgent} from '../utils/sample-data.js'
import {reviewNotesPlugin} from '../utils/sample-plugins.js'

describe('the composer menus', () => {
  test('a pick from the slash list or the model menu, Escape and an outside click each close the menu and give the composer its focus back at once', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    await mountShell({engine})
    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})

    await user.type(input, '/dep')
    await user.click(await screen.findByRole('option', {name: '/deploy'}))
    expect(input).toHaveFocus()
    await expect.element(input).toHaveTextContent('/deploy')

    await user.click(await screen.findByRole('button', {name: 'Model: Opus 5.5'}))
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Model'})).getByRole('option', {name: 'Sonnet 5.5'}),
    )
    expect(input).toHaveFocus()

    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5'}))
    const search = await screen.findByRole('textbox', {name: 'Search models'})
    await expect.element(search).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(input).toHaveFocus()

    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5'}))
    await expect.element(await screen.findByRole('textbox', {name: 'Search models'})).toHaveFocus()
    await page.getByText('How can I help you today?').click()
    await expect.element(input).toHaveFocus()
  })
})

describe('sending with the keyboard', () => {
  test('Enter sends the typed message, the composer empties and asks for the next instruction, and Enter while an IME composes does not send', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    engine.reply(FakeLLM.text('Hello from the agent'))
    engine.reply(FakeLLM.text('Composed'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await screen.findByText('Ask a question…')).toBeVisible()
    await user.type(input, 'Hello agent')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('article', {name: 'You: Hello agent'})).toBeVisible()
    const reply = await screen.findByRole('article', {name: 'Reply to: Hello agent'})
    expect(await within(reply).findByText('Hello from the agent')).toBeVisible()
    expect(await screen.findByText('Add an instruction…')).toBeVisible()
    expect(sentTexts(engine)).toEqual(['Hello agent'])

    await user.type(input, 'Kana')
    fireEvent.keyDown(input, {key: 'Enter', isComposing: true})
    expect(input).toHaveFocus()
    await user.keyboard('done')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Composed')).toBeVisible()
    expect(sentTexts(engine)[1]).toBe('Kana\ndone')
  })
})

describe('stopping with Escape', () => {
  test('Escape in the composer stops a reply that is still working', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    const gate = engine.gate()
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Take your time')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    expect(await screen.findByRole('button', {name: 'Stop generating'})).toBeVisible()
    expect(input).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(await screen.findByText('Stopped')).toBeVisible()
  })
})

describe('queueing while the agent works', () => {
  test('a message sent during a reply waits in the queue, a removed one never reaches the agent, and the next runs after the reply', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    const gate = engine.gate()
    engine.reply(FakeLLM.text('First answer'), FakeLLM.text('Third answer'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('1 waiting · runs in order')).toBeVisible()
    expect(screen.getByText('Second task')).toBeVisible()
    expect(screen.getByText('Queue another instruction…')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Remove from queue'}))
    await expect.element(page.getByText('Second task', {exact: true})).not.toBeInTheDocument()
    await user.type(input, 'Third task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('1 waiting · runs in order')).toBeVisible()
    await gate.release()

    const third = await screen.findByRole('article', {name: 'Reply to: Third task'})
    expect(await within(third).findByText('Third answer')).toBeVisible()
    expect(within(screen.getByRole('article', {name: 'Reply to: First task'})).getByText('First answer')).toBeVisible()
    expect(screen.queryByText('1 waiting · runs in order')).not.toBeInTheDocument()
    expect(screen.queryByRole('article', {name: 'You: Second task'})).not.toBeInTheDocument()
    expect(sentTexts(engine)).toEqual(['First task', 'Third task'])
  })
})

describe('steering the agent', () => {
  test('Steer takes a queued message out of the queue and interrupts the reply with it', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    const gate = engine.gate()
    const steerGate = engine.gate()
    engine.reply(FakeLLM.text('Changed course'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    expect(await screen.findByRole('button', {name: 'Stop generating'})).toBeVisible()
    await user.type(input, 'Do this instead')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('button', {name: 'Steer'}))
    await steerGate.started
    await expect.element(page.getByText('1 waiting · runs in order')).not.toBeInTheDocument()
    await steerGate.release()

    const steered = await screen.findByRole('article', {name: 'Reply to: Do this instead'})
    expect(await within(steered).findByText('Changed course')).toBeVisible()
    expect(screen.queryByText('First answer')).not.toBeInTheDocument()
    expect(sentTexts(engine)).toEqual(['First task', 'Do this instead'])
  })
})

describe('stopping with a queue', () => {
  test('a long queue shows three rows and a count, and Stop puts every message back in the composer in order', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    const gate = engine.gate()
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.type(input, 'Third task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.type(input, 'Fourth task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.type(input, 'Fifth task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('4 waiting · runs in order')).toBeVisible()
    expect(screen.getByText('Fourth task')).toBeVisible()
    expect(screen.getByText('+1 more')).toBeVisible()
    expect(screen.queryByText('Fifth task')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(screen.queryByText('4 waiting · runs in order')).not.toBeInTheDocument()
    await expect.element(input).toHaveTextContent('Second taskThird taskFourth taskFifth task')
  })
})

describe('the slash list', () => {
  test('/ lists the commands of the session’s own harness and a picked one reaches the agent as text', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine({
      harnesses: [
        {
          ...ENGINE_HARNESS,
          commands: [{name: 'review-pr', description: 'Review the open pull request', source: 'harness'}],
        },
      ],
    })
    engine.reply(FakeLLM.text('Reviewing now'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '/')
    const commands = await screen.findByRole('listbox', {name: 'Commands'})
    expect(await within(commands).findByRole('option', {name: '/review-pr'})).toBeVisible()
    expect(within(commands).getByRole('option', {name: '/model'})).toBeVisible()
    expect(within(commands).queryByRole('option', {name: '/deploy'})).not.toBeInTheDocument()
    await user.type(input, 'rev')
    await user.click(await within(commands).findByRole('option', {name: '/review-pr'}))
    await expect.element(input).toHaveTextContent('/review-pr')
    await user.type(input, '{Enter}')

    const reply = await screen.findByRole('article', {name: 'Reply to: /review-pr'})
    expect(await within(reply).findByText('Reviewing now')).toBeVisible()
    expect(sentTexts(engine)).toEqual(['/review-pr'])
  })
})

describe('the model command', () => {
  test('picking /model from the list or sending exactly /model opens the model menu and sends nothing', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    engine.reply(FakeLLM.text('Hi there'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '/mo')
    await user.click(await screen.findByRole('option', {name: '/model'}))
    const picked = await screen.findByRole('textbox', {name: 'Search models'})
    expect(picked).toBeVisible()
    await user.type(picked, '{Escape}')
    await expect.element(page.getByRole('textbox', {name: 'Search models'})).not.toBeInTheDocument()

    await user.type(input, '/model ')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    const search = await screen.findByRole('textbox', {name: 'Search models'})
    expect(search).toBeVisible()
    await user.type(search, '{Escape}')
    await user.type(input, 'Hello')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Hello'})
    expect(await within(reply).findByText('Hi there')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'You: /model'})).not.toBeInTheDocument()
    expect(sentTexts(engine)).toEqual(['Hello'])
  })
})

describe('the mention list', () => {
  test('@ lists skills, subagents, tools and this project’s other sessions, a term narrows them, and a pick inserts its mention', async () => {
    const user = userEvent.setup()
    const engine = composerEngine({
      sessions: [
        {id: 'ses_current', title: 'Current work'},
        {id: 'ses_login', title: 'Fix login bug'},
        {id: 'ses_docs', title: 'Deploy the docs'},
      ],
      handlers: {
        meta: {tools: () => ({tools: [{name: 'read', description: 'Read a file'}]})},
        skill: {
          list: () => ({
            location: {directory: '/workspace'},
            data: [
              {
                id: 'release-notes',
                name: 'release-notes',
                description: 'Write the release notes',
                path: 'conciv/skills/release-notes/SKILL.md',
                content: 'Write the release notes',
              },
            ],
          }),
        },
        agent: {
          list: () => ({
            location: {directory: '/workspace'},
            data: [
              mentionAgent('reviewer', 'subagent', 'Reviews the change before it ships'),
              mentionAgent('build', 'primary', 'Builds the project'),
            ],
          }),
        },
        fs: {
          find: ({query}) => ({
            location: {directory: '/workspace'},
            data: 'src/login-form.txt'.includes(query) ? [{path: 'src/login-form.txt', type: 'file'}] : [],
          }),
        },
      },
    })
    await mountShell({engine, initialEntries: ['/panel/ses_current?open=true']})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '@')
    const context = await screen.findByRole('listbox', {name: 'Context'})
    expect(await within(context).findByRole('option', {name: '@release-notes'})).toBeVisible()
    expect(within(context).getByRole('option', {name: '@reviewer'})).toBeVisible()
    expect(within(context).queryByRole('option', {name: '@build'})).not.toBeInTheDocument()
    expect(within(context).getByRole('option', {name: 'Fix login bug'})).toBeVisible()
    expect(within(context).getByRole('option', {name: 'Deploy the docs'})).toBeVisible()
    expect(within(context).getByRole('group', {name: 'Tools'})).toBeVisible()
    await user.type(input, 'login')
    expect(await within(context).findByRole('option', {name: 'src/login-form.txt'})).toBeVisible()
    expect(within(context).getByRole('option', {name: 'Fix login bug'})).toBeVisible()
    expect(within(context).queryByRole('option', {name: 'Deploy the docs'})).not.toBeInTheDocument()
    await user.click(within(context).getByRole('option', {name: 'Fix login bug'}))

    await expect.element(input).toHaveTextContent('@Fix login bug')
    await expect.element(page.getByRole('listbox', {name: 'Context', exact: true})).not.toBeInTheDocument()
  })

  test('with no term, @ ranks a session open in another quick pane above a newer one that is not open', async () => {
    const user = userEvent.setup()
    const engine = composerEngine({
      sessions: [
        {id: 'ses_typing', title: 'Typing here'},
        {id: 'ses_newer', title: 'Newer elsewhere'},
        {id: 'ses_open', title: 'Open beside'},
      ],
    })
    await mountShell({engine, initialEntries: ['/quick?panes=ses_typing,ses_open&focus=0']})

    const pane = await screen.findByRole('region', {name: 'Session: Typing here'})
    await user.type(within(pane).getByRole('textbox', {name: 'Message the conciv agent'}), '@')
    const context = await screen.findByRole('listbox', {name: 'Context'})
    expect(await within(context).findByRole('option', {name: 'Newer elsewhere'})).toBeVisible()
    const sessions = within(context).getAllByRole('option', {name: /^(Open beside|Newer elsewhere|Typing here)$/})
    expect(sessions).toHaveLength(2)
    expect(sessions[0]).toHaveAccessibleName('Open beside')
    expect(sessions[1]).toHaveAccessibleName('Newer elsewhere')
  })

  test('a typed term finds a session of another project, which a bare @ leaves out', async () => {
    const user = userEvent.setup()
    const engine = composerEngine({
      handlers: {
        meta: {tools: () => ({tools: [{name: 'read', description: 'Read a file'}]})},
        sessions: {
          search: ({term}) => ({
            sessions: 'billing'.startsWith(term.toLowerCase()) ? [elsewhereSession()] : [],
            next: null,
          }),
        },
      },
    })
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, '@')
    const context = await screen.findByRole('listbox', {name: 'Context'})
    expect(await within(context).findByRole('group', {name: 'Tools'})).toBeVisible()
    expect(within(context).queryByRole('option', {name: 'Fix the billing page'})).not.toBeInTheDocument()
    await user.type(input, 'billing')
    expect(await within(context).findByRole('option', {name: 'Fix the billing page'})).toBeVisible()
  })
})

describe('picking a model and an effort', () => {
  test('the prompt shows the picked model and effort, the agent runs on them, and a model with no efforts drops the effort', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    engine.reply(FakeLLM.text('On Sonnet'), FakeLLM.text('On Haiku'))
    await mountShell({engine})

    await user.click(await screen.findByRole('button', {name: 'Model: Opus 5.5'}))
    const menu = await screen.findByRole('dialog', {name: 'Model'})
    expect(within(menu).getByRole('option', {name: 'Opus 5.5', selected: true})).toBeVisible()
    expect(within(menu).getByRole('button', {name: 'Older versions'})).toBeVisible()
    expect(within(menu).queryByRole('option', {name: 'Haiku 4.5'})).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('option', {name: 'Sonnet 5.5'}))

    await user.click(await screen.findByRole('button', {name: 'Model: Sonnet 5.5'}))
    await user.click(await screen.findByRole('radio', {name: 'High'}))
    expect(await screen.findByRole('button', {name: 'Model: Sonnet 5.5, effort High'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5, effort High'}))
    await expect.element(page.getByRole('dialog', {name: 'Model', exact: true})).not.toBeInTheDocument()

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Which model?')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Which model?'})
    expect(await within(reply).findByText('On Sonnet')).toBeVisible()
    const sessionId = engine.sent()[0]?.sessionId ?? ''
    expect(await readSession(engine, sessionId)).toMatchObject({model: 'sonnet', effort: 'high'})

    await user.click(screen.getByRole('button', {name: 'Model: Sonnet 5.5, effort High'}))
    await user.click(await screen.findByRole('button', {name: 'Older versions'}))
    await user.click(await screen.findByRole('option', {name: 'Haiku 4.5'}))
    await user.click(await screen.findByRole('button', {name: 'Model: Haiku 4.5'}))
    expect(await screen.findByRole('option', {name: 'Haiku 4.5', selected: true})).toBeVisible()
    expect(screen.queryByRole('radiogroup', {name: 'Effort'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Model: Haiku 4.5'}))

    await user.type(input, 'And now?')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const next = await screen.findByRole('article', {name: 'Reply to: And now?'})
    expect(await within(next).findByText('On Haiku')).toBeVisible()
    expect(await readSession(engine, sessionId)).toMatchObject({model: 'claude-haiku-4-5'})
  })
})

describe('switching the harness', () => {
  test('while a reply runs the other harness’s models are disabled, a model of another harness asks first when the chat has history, the next reply runs on it, and each reply then names its harness', async () => {
    const user = userEvent.setup({delay: null})
    const secondHarness = harness('second', 'second', [{id: 'second-fast', name: 'Fast 1', group: 'Second'}])
    const engine: FakeEngine = composerEngine({harnesses: [ENGINE_HARNESS, secondHarness]})
    const gate = engine.gate()
    engine.reply(FakeLLM.text('First answer'), FakeLLM.text('Second answer'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    expect(await screen.findByRole('button', {name: 'Stop generating'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Model: Opus 5.5 (engine)'}))
    await expect.element(page.getByRole('option', {name: 'Fast 1 (second)', disabled: true})).toBeVisible()
    await expect.element(page.getByRole('option', {name: /^Sonnet 5\.5/, disabled: false})).toBeVisible()
    const search = await screen.findByRole('textbox', {name: 'Search models'})
    await expect.element(search).toHaveFocus()
    await user.keyboard('{Escape}')
    await gate.release()

    const first = await screen.findByRole('article', {name: 'Reply to: First task'})
    expect(await within(first).findByText('First answer')).toBeVisible()
    expect(within(screen.getByRole('log')).queryByText('engine')).not.toBeInTheDocument()
    const sessionId = engine.sent()[0]?.sessionId ?? ''
    expect(await readSession(engine, sessionId)).toMatchObject({harnessKind: 'fake', model: null})

    await user.click(await screen.findByRole('button', {name: 'Model: Opus 5.5 (engine)'}))
    await user.click(await screen.findByRole('option', {name: 'Fast 1 (second)'}))
    const confirm = await screen.findByRole('alertdialog', {name: 'Switch harness?'})
    expect(within(confirm).getByText(/Switching to second sends this chat’s history/)).toBeVisible()
    await user.click(within(confirm).getByRole('button', {name: 'Switch to second'}))

    expect(await screen.findByText('Switched to Fast 1 (second).')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Model: Fast 1 (second)'})).toBeVisible()
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const second = await screen.findByRole('article', {name: 'Reply to: Second task'})
    expect(await within(second).findByText('Second answer')).toBeVisible()
    const thread = screen.getByRole('log')
    expect(within(thread).getByText('engine')).toBeVisible()
    expect(within(thread).getByText('second')).toBeVisible()
    expect(await readSession(engine, sessionId)).toMatchObject({harnessKind: 'second', model: 'second-fast'})
    expect(sentTexts(engine)).toEqual(['First task', 'Second task'])
  })
})

describe('a harness with no models', () => {
  test('the prompt names the harness and the menu says it has no usable models', async () => {
    const user = userEvent.setup()
    const engine = composerEngine({harnesses: [{...ENGINE_HARNESS, models: [], defaultModel: null}]})
    await mountShell({engine})

    await user.click(await screen.findByRole('button', {name: 'Model: engine'}))

    expect(await screen.findByText('engine has no usable models')).toBeVisible()
  })
})

describe('a draft per session', () => {
  test('each session keeps its own typed draft across switches in the session picker, and a sent draft does not come back', async () => {
    const user = userEvent.setup()
    const engine = composerEngine({
      sessions: [
        {id: 'ses_alpha', title: 'Alpha'},
        {id: 'ses_beta', title: 'Beta'},
      ],
    })
    engine.reply(FakeLLM.text('Shipped'))
    await mountShell({engine, initialEntries: ['/panel/ses_alpha?open=true']})

    const alphaInput = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(alphaInput, 'Half-written idea')

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()
    const betaInput = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await screen.findByText('Ask a question…')).toBeVisible()
    await user.type(betaInput, 'Beta notes')

    await user.click(screen.getByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /Alpha/}))
    expect(await screen.findByRole('button', {name: 'Alpha, session options'})).toBeVisible()
    const backInAlpha = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await within(backInAlpha).findByText('Half-written idea')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()
    const backInBeta = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await within(backInBeta).findByText('Beta notes')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /Alpha/}))
    expect(await screen.findByRole('button', {name: 'Alpha, session options'})).toBeVisible()
    const sendInAlpha = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await within(sendInAlpha).findByText('Half-written idea')).toBeVisible()
    await user.click(sendInAlpha)
    expect(sendInAlpha).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Half-written idea'})
    expect(await within(reply).findByText('Shipped')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /Alpha/}))
    expect(await screen.findByRole('article', {name: 'Reply to: Half-written idea'})).toBeVisible()
    expect(await screen.findByText('Add an instruction…')).toBeVisible()
    const sentInAlpha = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    expect(within(sentInAlpha).queryByText('Half-written idea')).not.toBeInTheDocument()
  })
})

describe('a deleted session with a draft', () => {
  test('closing the quick pane of a session deletes it, and New session on its panel carries the typed draft over, announced once the new session shows', async () => {
    const user = userEvent.setup()
    const engine = composerEngine({sessions: [{id: 'ses_doomed', title: 'Doomed work'}]})
    await mountShell({engine, initialEntries: ['/panel/ses_doomed?open=true', '/quick?panes=ses_doomed&focus=0']})

    const pane = await screen.findByRole('region', {name: 'Session: Doomed work'})
    await user.type(within(pane).getByRole('textbox', {name: 'Message the conciv agent'}), 'Keep this thought')
    await user.click(within(pane).getByRole('button', {name: 'Close pane'}))

    expect(await screen.findByText('This session was deleted.')).toBeVisible()
    expect(await screen.findByText('Your draft moves to the new session.')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'New session'}))
    expect(await screen.findByText('Started a new session')).toBeVisible()
    expect(screen.queryByText('This session was deleted.')).not.toBeInTheDocument()
    const moved = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await within(moved).findByText('Keep this thought')).toBeVisible()
  })
})

describe('attaching text files', () => {
  test('pasted files show as chips, Backspace and Remove take them off, and the sent message carries the kept file', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    engine.reply(FakeLLM.text('Read them'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.click(input)
    const clipboard = new DataTransfer()
    clipboard.items.add(new File(['Buy milk'], 'notes.txt', {type: 'text/plain'}))
    clipboard.items.add(new File(['Step one'], 'plan.md', {type: 'text/plain'}))
    clipboard.items.add(new File(['noise'], 'extra.log', {type: 'text/plain'}))
    expect(input).toHaveFocus()
    await user.paste(clipboard)
    expect(await screen.findByRole('button', {name: 'notes.txt'})).toBeVisible()
    expect(await screen.findByRole('button', {name: 'plan.md'})).toBeVisible()
    expect(await screen.findByRole('button', {name: 'extra.log'})).toBeVisible()

    expect(input).toHaveFocus()
    await user.keyboard('{Backspace}')
    await expect.element(page.getByRole('button', {name: 'extra.log', exact: true})).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'plan.md'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Remove plan.md'}))
    await expect.element(page.getByRole('button', {name: 'plan.md', exact: true})).not.toBeInTheDocument()

    await user.type(input, 'Read my notes')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: /^Reply to: Read my notes/})
    expect(await within(reply).findByText('Read them')).toBeVisible()
    const [sent, ...more] = sentJson(engine)
    expect(more).toHaveLength(0)
    expect(sent).toContain('Read my notes')
    expect(sent).toContain('notes.txt')
    expect(sent).toContain('Buy milk')
    expect(sent).not.toContain('plan.md')
    expect(sent).not.toContain('extra.log')
  })
})

describe('the send caps', () => {
  it.each([
    {
      cap: 'more than 16 attachments',
      files: Array.from({length: 17}, (_, index) => new File(['line'], `part-${index}.txt`, {type: 'text/plain'})),
      notice: 'Too many attachments. Remove some and send again.',
    },
    {
      cap: 'a message over the socket budget',
      files: Array.from(
        {length: 3},
        (_, index) => new File(['\u0000'.repeat(1_048_576)], `dump-${index}.log`, {type: 'text/plain'}),
      ),
      notice: 'Message too large to send. Remove an attachment or shorten it.',
    },
  ])('$cap is refused with a notice, and the message stays in the composer', async ({files, notice}) => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Look at these')
    const clipboard = new DataTransfer()
    for (const file of files) clipboard.items.add(file)
    expect(input).toHaveFocus()
    await user.paste(clipboard)
    expect(await screen.findByRole('button', {name: files.at(-1)?.name})).toBeVisible()
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText(notice)).toBeVisible()
    expect(input).toHaveTextContent('Look at these')
    expect(screen.getByRole('button', {name: files.at(0)?.name})).toBeVisible()
    expect(engine.sent()).toHaveLength(0)
  })
})

describe('an attachment that cannot be sent', () => {
  test('a text file over the 1MB limit is marked failed, Enter leaves the message in the composer unsent, and it sends once the file is removed', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    engine.reply(FakeLLM.text('Read it'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Read the log')
    const clipboard = new DataTransfer()
    clipboard.items.add(new File(['a'.repeat(1_048_577)], 'big.log', {type: 'text/plain'}))
    expect(input).toHaveFocus()
    await user.paste(clipboard)
    expect(await screen.findByRole('button', {name: 'big.log exceeds the 1MB text limit'})).toBeVisible()

    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(input).toHaveTextContent('Read the log')
    expect(screen.getByRole('button', {name: 'big.log exceeds the 1MB text limit'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Remove big.log'}))
    await expect
      .element(page.getByRole('button', {name: 'big.log exceeds the 1MB text limit', exact: true}))
      .not.toBeInTheDocument()
    await user.click(input)
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: /^Reply to: Read the log/})
    expect(await within(reply).findByText('Read it')).toBeVisible()
    expect(sentTexts(engine)).toEqual(['Read the log'])
  })
})

describe('notes from a plugin', () => {
  test('a pill attaches a note drawn as the host chip, since only a built-in plugin draws note cards, and hands the composer focus, Remove takes it off, and a sent note reaches the agent and stays on the message', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    const gate = engine.gate()
    engine.reply(FakeLLM.text('Header is sticky now'))
    await mountShell({engine, plugins: [reviewNotesPlugin]})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.click(await screen.findByRole('button', {name: 'Review'}))
    await expect.element(input).toHaveFocus()
    const notes = await screen.findByRole('list', {name: 'Notes'})
    expect(within(notes).getByText('Make the header sticky')).toBeVisible()
    await user.click(within(notes).getByRole('button', {name: 'Remove Make the header sticky'}))
    await expect.element(page.getByRole('list', {name: 'Notes', exact: true})).not.toBeInTheDocument()
    await expect.element(input).toHaveFocus()

    await user.click(screen.getByRole('button', {name: 'Review'}))
    expect(within(await screen.findByRole('list', {name: 'Notes'})).getByText('Make the header sticky')).toBeVisible()
    await user.type(input, 'Polish the page')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await gate.release()

    const reply = await screen.findByRole('article', {name: 'Reply to: Polish the page'})
    expect(await within(reply).findByText('Header is sticky now')).toBeVisible()
    const sent = screen.getByRole('list', {name: 'Notes on this message'})
    expect(within(sent).getByText('Make the header sticky')).toBeVisible()
    expect(screen.queryByRole('list', {name: 'Notes'})).not.toBeInTheDocument()
    expect(sentTexts(engine)).toEqual([
      'Polish the page\nThe user made the following comment regarding the page header: Make the header sticky',
    ])
  })
})

describe('plugin pills', () => {
  test('pills sit in their order, a row runs, a menu pill shows its content, and a pill shows only while its plugin says so', async () => {
    const user = userEvent.setup()
    const engine = composerEngine()
    await mountShell({engine, plugins: [reviewNotesPlugin]})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await screen.findByRole('button', {name: 'Review'})
    const pills = screen.getAllByRole('button', {name: /^(Checks|Deploy status|Review)$/})
    expect(pills).toHaveLength(3)
    expect(pills[0]).toHaveAccessibleName('Checks')
    expect(pills[1]).toHaveAccessibleName('Deploy status')
    expect(pills[2]).toHaveAccessibleName('Review')

    await user.click(screen.getByRole('button', {name: 'Deploy status'}))
    expect(await screen.findByText('Staging is green')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Done'}))
    await expect.element(page.getByText('Staging is green', {exact: true})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Checks'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Lint failed'}))
    await expect.element(input).toHaveTextContent('Fix lint')
    await expect.element(page.getByRole('button', {name: 'Checks', exact: true})).not.toBeInTheDocument()
  })
})

describe('the composer actions menu', () => {
  test('Start a new session opens an empty session, announced once it shows, and its model menu stays open while its models load', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    engine.reply(FakeLLM.text('Done with it'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('article', {name: 'Reply to: First task'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'More composer actions'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Start a new session'}))
    expect(await screen.findByText('Started a new session')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'You: First task'})).not.toBeInTheDocument()
    expect(screen.getByText('Ask a question…')).toBeVisible()

    await user.click(screen.getByRole('button', {name: /^Model: /}))
    expect(await screen.findByRole('option', {name: /^Sonnet 5\.5/})).toBeVisible()
    expect(screen.getByRole('dialog', {name: 'Model'})).toBeVisible()
  })

  test('Compress the conversation compacts it, and a message sent while it compacts stays in the composer unsent', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    engine.reply(FakeLLM.text('Done with it'))
    const compaction = engine.gate()
    engine.reply(FakeLLM.text('A summary of the work so far'))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('article', {name: 'Reply to: First task'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'More composer actions'}))
    await user.click(await screen.findByRole('menuitem', {name: 'Compress the conversation'}))
    await compaction.started
    expect(await screen.findByRole('separator', {name: 'Compacting…'})).toBeVisible()
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await expect.element(input).toHaveTextContent('Second task')
    expect(screen.queryByText('1 waiting · runs in order')).not.toBeInTheDocument()
    const notifications = screen.getByRole('region', {name: /^Notifications/})
    expect(within(notifications).queryByRole('status')).not.toBeInTheDocument()
    expect(within(notifications).queryByRole('alert')).not.toBeInTheDocument()

    compaction.release()
    expect(await screen.findByRole('separator', {name: 'Context compacted'})).toBeVisible()
    expect(input).toHaveTextContent('Second task')
    expect(screen.queryByRole('article', {name: 'You: Second task'})).not.toBeInTheDocument()
    expect(engine.sent()).toHaveLength(1)
  })
})

describe('plugin slash commands', () => {
  test('a plugin command is listed under Commands where its after places it, runs when picked, and a typed command runs with its arguments instead of sending', async () => {
    const user = userEvent.setup({delay: null})
    const engine = composerEngine()
    engine.reply(FakeLLM.text('Noted'))
    await mountShell({engine, plugins: [reviewNotesPlugin]})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    expect(await screen.findByRole('button', {name: 'Review'})).toBeVisible()
    await user.type(input, '/')
    const commands = await screen.findByRole('listbox', {name: 'Commands'})
    expect(await within(commands).findByRole('option', {name: '/summary'})).toBeVisible()
    const listed = within(commands).getAllByRole('option', {name: /^\/(model|review|summary)$/})
    expect(listed).toHaveLength(3)
    expect(listed[0]).toHaveAccessibleName('/model')
    expect(listed[1]).toHaveAccessibleName('/summary')
    expect(listed[2]).toHaveAccessibleName('/review')

    await user.click(within(commands).getByRole('option', {name: '/summary'}))
    expect(await screen.findByText('Summary ready')).toBeVisible()

    await user.type(input, '/rev')
    await user.click(await screen.findByRole('option', {name: '/review'}))
    await user.type(input, 'the header')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Reviewing the header')).toBeVisible()
    await user.type(input, 'Thanks')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: 'Reply to: Thanks'})
    expect(await within(reply).findByText('Noted')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'You: /review the header'})).not.toBeInTheDocument()
    expect(sentTexts(engine)).toEqual(['Thanks'])
  })
})

describe('drive mode', () => {
  engineTest(
    'a driver outside the browser finds the composer in the snapshot, types into it by its label, sends with the send button by its role, and the answer shows',
    async ({createEngine}) => {
      const engine = await createEngine({}, {simulation: true})
      const connection = makeBrowserEngineConnection(engine.address.apiBase, {
        tokenSource: () => Promise.resolve(engine.address.token),
      })
      onTestFinished(() => connection.dispose())
      await mountShell({
        engine: {apiBase: engine.address.apiBase, connection},
        plugins: [{id: 'conciv.simulation.ui', plugin: {setup: drive}, builtin: true, engineHalf: true}],
      })
      const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
      const driver = await engine.drive()

      expect((await driver.snapshot()).nodes).toContainEqual(
        expect.objectContaining({role: 'textbox', label: 'Message the conciv agent'}),
      )
      await driver.answer('Driven answer')
      expect(
        (await driver.typeInto('textbox', 'Message the conciv agent', 'Hello from the driver')).focused.editor,
      ).toBe(true)
      expect(input).toHaveFocus()
      expect(input).toHaveTextContent('Hello from the driver')
      const finished = await engine.event('session.execution.succeeded')
      await driver.clickByRole('button', 'Send message')

      await finished.arrived
      const reply = await screen.findByRole('article', {name: 'Reply to: Hello from the driver'})
      expect(within(reply).getByText('Driven answer')).toBeVisible()
    },
  )
})
