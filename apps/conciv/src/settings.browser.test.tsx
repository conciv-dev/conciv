import {describe, expect, test} from 'vitest'
import {screen, within, render} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '../test/browser-engine.js'
import {createEngineRouterHistory, mount} from '../test/mount.js'
import {page, userEvent as browserInput, userEvent as browserUserEvent} from 'vitest/browser'
import {createMemoryHistory} from '@tanstack/solid-router'
import {createEventBusClient, PANEL_PLUGIN_ID, type PanelCommandEventMap} from '@conciv/protocol/event-bus'

describe('moving around settings', () => {
  test('settings open on General, then on the last section the user left', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    expect(await screen.findByRole('tab', {name: 'General', selected: true})).toBeVisible()
    expect(await screen.findByRole('radio', {name: 'Auto'})).toBeChecked()

    await user.click(screen.getByRole('tab', {name: 'Shortcuts'}))
    expect(await screen.findByRole('tab', {name: 'Shortcuts', selected: true})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Back to chat'}))
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect(screen.queryByRole('tablist', {name: 'Settings sections'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', {name: 'Settings'}))
    expect(await screen.findByRole('tab', {name: 'Shortcuts', selected: true})).toBeVisible()
  })
})

describe('settings for this project and for all projects', () => {
  test('a value saved for all projects shows here until this project overrides it, also when another client writes it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.setting({scope: 'global', namespace: 'conciv', key: 'colorScheme', value: 'dark'})
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
    })
    await user.click(await screen.findByRole('link', {name: 'Settings'}))

    expect(await screen.findByRole('radio', {name: 'Dark'})).toBeChecked()
    expect(screen.getByText('From all projects')).toBeVisible()

    await user.click(screen.getByRole('switch', {name: 'All projects'}))
    expect(await screen.findByRole('switch', {name: 'All projects', checked: true})).toBeChecked()
    expect(screen.getByRole('radio', {name: 'Dark'})).toBeChecked()
    expect(screen.queryByText('From all projects')).not.toBeInTheDocument()

    await engine.setting({scope: 'project', namespace: 'conciv', key: 'colorScheme', value: 'light'})
    expect(await screen.findByText('This project overrides it')).toBeVisible()
    expect(screen.getByRole('radio', {name: 'Dark'})).toBeChecked()

    await user.click(screen.getByRole('switch', {name: 'All projects'}))
    expect(await screen.findByRole('radio', {name: 'Light'})).toBeChecked()
    expect(screen.queryByText('From all projects')).not.toBeInTheDocument()
  })
})

describe('resetting settings', () => {
  test('the user resets the shortcuts, then every setting of this project', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.setting({
      scope: 'project',
      namespace: 'conciv',
      key: 'commandShortcuts',
      value: {togglePanel: ['Mod+K']},
    })
    await engine.setting({scope: 'project', namespace: 'conciv', key: 'colorScheme', value: 'dark'})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    expect(await screen.findByRole('radio', {name: 'Dark', checked: true})).toBeVisible()

    await user.click(screen.getByRole('tab', {name: 'Advanced'}))
    await user.click(await screen.findByRole('button', {name: 'Reset shortcuts'}))
    expect(await screen.findByText('Settings reset')).toBeVisible()
    await user.click(screen.getByRole('tab', {name: 'Shortcuts'}))
    expect(await screen.findByText(/^(Ctrl|Cmd)\+Period$/)).toBeVisible()
    expect(screen.queryByText(/^(Ctrl|Cmd)\+K$/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', {name: 'Advanced'}))
    await user.click(await screen.findByRole('link', {name: 'Reset all'}))
    const confirm = await screen.findByRole('alertdialog', {name: 'Reset all settings?'})
    await user.click(within(confirm).getByRole('button', {name: 'Reset everything'}))
    expect(await screen.findByRole('link', {name: 'Reset all'})).toBeVisible()
    await user.click(screen.getByRole('tab', {name: 'General'}))
    expect(await screen.findByRole('radio', {name: 'Auto', checked: true})).toBeVisible()
    expect(screen.queryByRole('alertdialog', {name: 'Reset all settings?'})).not.toBeInTheDocument()
  })
})

describe('plugins in settings', () => {
  test('a server plugin turned off elsewhere shows off in its settings row, and the user turns it on', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']})
    await engine.setting({scope: 'global', namespace: 'plugin-enable', key: 'release-train', value: false})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Plugins'}))
    expect(await screen.findByRole('switch', {name: 'release-train', checked: false})).toBeVisible()
    expect(screen.getByText('Server')).toBeVisible()
    expect(
      screen.getByText(
        `Switches turn off only a plugin's page UI. Add "-<id>" to the plugins option of conciv() in your build config to turn off its server part.`,
      ),
    ).toBeVisible()

    await user.click(screen.getByRole('switch', {name: 'release-train'}))
    await user.click(screen.getByRole('button', {name: 'Back to chat'}))
    expect(await screen.findByText('Next train at noon')).toBeVisible()
  })

  test('a plugin added to the project while the Plugins section is open joins the list', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/release-train']}, {fs: {filewatcher: true}})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Plugins'}))
    expect(await screen.findByRole('switch', {name: 'release-train'})).toBeVisible()
    expect(screen.queryByText('desk-notes')).not.toBeInTheDocument()

    await engine.write('conciv/plugins/desk-notes.js', "export default {id: 'desk-notes', setup: () => undefined}\n")

    expect(await screen.findByText('desk-notes')).toBeVisible()
    expect(screen.getByRole('switch', {name: 'release-train'})).toBeVisible()

    const schedule = screen.getByRole('tab', {name: 'Release schedule'})
    const href = schedule.querySelector('use')?.getAttribute('href') ?? ''
    expect(href).toMatch(/^#/)
    expect(document.querySelector(`symbol${href}`)).toHaveAttribute('viewBox', '0 0 16 16')
    const sprite = document.querySelector(`symbol${href}`)?.parentElement
    await user.click(screen.getByRole('switch', {name: 'release-train'}))

    await expect.element(page.getByRole('tab', {name: 'Release schedule'})).not.toBeInTheDocument()
    expect(document.querySelector(`symbol${href}`)).not.toBeInTheDocument()
    expect(sprite?.isConnected).toBe(false)
  })

  test('a plugin page joins the sections and its section shows in General, an unknown plugin page opens General, and a plugin under a built-in ID is not loaded', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/shell-board', './test/fixtures/plugins/conciv'],
    })
    await mount({
      engine,
      history: createEngineRouterHistory({
        initialEntries: [`/panel/${engine.session.id}/settings/plugins/nowhere?open=true`],
      }),
    })

    expect(await screen.findByRole('tab', {name: 'General', selected: true})).toBeVisible()
    expect(await screen.findByText('Deploy notes live here')).toBeVisible()

    await user.click(screen.getByRole('tab', {name: 'Deploy targets'}))
    expect(await screen.findByText('Ship to staging first')).toBeVisible()
    expect(screen.getByRole('tab', {name: 'Deploy targets', selected: true})).toBeVisible()

    await user.click(screen.getByRole('tab', {name: 'Plugins'}))
    expect(await screen.findByText('Not loaded. A built-in plugin already uses this ID.')).toBeVisible()
  })
})

describe('the general settings change the panel', () => {
  test('the user picks a colour mode, a skin, hides the launcher and brings it back, and closes the panel with a page click, and the host closes it while it opens', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    const history = createMemoryHistory({initialEntries: ['/panel/latest?open=true']})
    await mount({engine, history})
    const panel = await screen.findByRole('dialog', {name: 'conciv chat agent'})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))

    await user.click(await screen.findByRole('radio', {name: 'Dark'}))
    await user.click(screen.getByRole('radio', {name: 'Terminal'}))
    await user.click(screen.getByRole('combobox', {name: 'Launcher'}))
    await user.click(await screen.findByRole('option', {name: 'Hidden'}))
    await user.click(screen.getByRole('switch', {name: 'Close on outside click'}))
    await user.click(screen.getByRole('button', {name: 'Back to chat'}))
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    expect(await screen.findByRole('switch', {name: 'Close on outside click', checked: true})).toBeVisible()
    expect(screen.getByRole('radio', {name: 'Dark'})).toBeChecked()
    expect(screen.getByRole('radio', {name: 'Terminal'})).toBeChecked()
    expect(screen.getByRole('combobox', {name: 'Launcher'})).toHaveTextContent('Hidden')
    expect(screen.queryByRole('button', {name: 'Minimize conciv chat'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', {name: 'Launcher'}))
    await user.click(await screen.findByRole('option', {name: 'Mascot'}))
    expect(await screen.findByRole('button', {name: 'Minimize conciv chat'})).toBeVisible()

    render(() => <p>The host page</p>)
    await user.click(screen.getByText('The host page'))
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    await expect.element(panel).not.toBeVisible()

    const closed = Promise.withResolvers<string>()
    const unsubscribe = history.subscribe(({location}) => {
      if (!location.search.includes('open=true')) closed.resolve(location.pathname)
    })
    const panelCommands = createEventBusClient<PanelCommandEventMap>({pluginId: PANEL_PLUGIN_ID})
    panelCommands.emit('open', undefined)
    panelCommands.emit('close', undefined)
    expect(await closed.promise).toMatch(/^\/panel\//)
    unsubscribe()
    panelCommands.dispose()
    expect(screen.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    await expect.element(panel).not.toBeVisible()
  })

  test('a project that chose to open on page load shows the panel when the page loads', async () => {
    const engine = await createEngine()
    await engine.setting({scope: 'project', namespace: 'conciv', key: 'openOnLoad', value: true})
    await mount({engine})

    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })

  test('a launcher and an open on load set by the page are shown locked in settings', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, host: {launcher: 'native', defaultOpen: true}})

    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    expect(await screen.findByRole('combobox', {name: 'Launcher'})).toHaveTextContent('Native')
    expect(screen.getByText('Set in conciv({launcher}) by this project.')).toBeVisible()
    expect(screen.getByText('Set in conciv({defaultOpen}) by this project.')).toBeVisible()
  })
})

describe('dragging a settings switch', () => {
  test('a drag cancelled with Escape leaves the switch as it was, and a drag past the middle turns the setting on', async () => {
    const user = userEvent.setup()
    render(() => <p>The host page</p>)
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    const panel = await screen.findByRole('dialog', {name: 'conciv chat agent'})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    const outsideClick = await screen.findByRole<HTMLInputElement>('switch', {name: 'Close on outside click'})
    const control = outsideClick.closest('label') ?? outsideClick

    await browserInput.pointer([
      {target: control, coords: {x: 4, y: 9}, keys: '[MouseLeft>]'},
      {target: control, coords: {x: 28, y: 9}},
    ])
    expect(await screen.findByRole('switch', {name: 'Close on outside click', checked: true})).toBeVisible()
    await browserInput.keyboard('{Escape}')
    expect(await screen.findByRole('switch', {name: 'Close on outside click', checked: false})).toBeVisible()
    await browserInput.pointer('[/MouseLeft]')
    expect(screen.getByRole('switch', {name: 'Close on outside click'})).not.toBeChecked()
    await browserInput.click(screen.getByText('The host page'))
    expect(panel).toBeVisible()

    await browserInput.pointer([
      {target: control, coords: {x: 4, y: 9}, keys: '[MouseLeft>]'},
      {target: control, coords: {x: 28, y: 9}, keys: '[/MouseLeft]'},
    ])
    expect(await screen.findByRole('switch', {name: 'Close on outside click', checked: true})).toBeVisible()
    await browserInput.click(screen.getByText('The host page'))
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    await expect.element(panel).not.toBeVisible()
  })
})

describe('the host page declares a skin in --conciv-skin', () => {
  test('a skin conciv ships is taken from the page and the Skin row says the page set it', async () => {
    const user = userEvent.setup()
    render(() => <style>{'body { --conciv-skin: terminal; }'}</style>)
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))

    expect(await screen.findByText('Set by the page in --conciv-skin')).toBeVisible()
    expect(screen.getByRole('radio', {name: 'Terminal'})).toBeChecked()
  })

  test('a page skin neon that conciv does not ship is not taken, and the Skin row keeps the user choice', async () => {
    const user = userEvent.setup()
    render(() => <style>{'body { --conciv-skin: neon; }'}</style>)
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))

    expect(await screen.findByRole('radio', {name: 'Conciv'})).toBeChecked()
    expect(screen.queryByText('Set by the page in --conciv-skin')).not.toBeInTheDocument()
  })
})

describe('recording keyboard shortcuts', () => {
  test('the user records a new panel key that then works, clears one, cancels one and moves a clashing one', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    const panel = await screen.findByRole('dialog', {name: 'conciv chat agent'})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Shortcuts'}))

    await user.click(await screen.findByRole('button', {name: 'Open or close conciv'}))
    expect(await screen.findByRole('button', {name: 'Open or close conciv', pressed: true})).toBeVisible()
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('button', {name: 'Open or close conciv', pressed: false})).toBeVisible()
    expect(await screen.findByText(/^(Ctrl|Control)\+K$/)).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Back to chat'}))
    await user.click(await screen.findByRole('textbox', {name: 'Message the conciv agent'}))
    expect(screen.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveFocus()
    await browserUserEvent.keyboard('{ControlOrMeta>}.{/ControlOrMeta}')
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    await expect.element(panel).not.toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('button', {name: 'Clear Quick terminal'}))
    expect(await screen.findByText('Add shortcut')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Clear Quick terminal'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Quick terminal'}))
    expect(await screen.findByRole('button', {name: 'Quick terminal', pressed: true})).toBeVisible()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('button', {name: 'Quick terminal', pressed: false})).toBeVisible()
    expect(screen.getByRole('tab', {name: 'Shortcuts', selected: true})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Quick terminal'}))
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByText(/(Ctrl\+K|⌃ K) is also/)).toMatchTextContent(
      /^(Ctrl\+K|⌃ K) is also Open or close conciv\. Saving moves it here\./,
    )
    await user.click(screen.getByRole('button', {name: 'Save'}))
    expect(await screen.findByRole('button', {name: 'Clear Quick terminal'})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Clear Open or close conciv'})).not.toBeInTheDocument()
    expect(screen.getByText('Add shortcut')).toBeVisible()
    expect(screen.getByText(/^(Ctrl|Control)\+K$/)).toBeVisible()
  })

  test('a page that turns the quick terminal off locks its shortcut rows', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({
      engine,
      host: {quickTerminal: false},
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
    })
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Shortcuts'}))

    expect(
      await screen.findAllByText('The quick terminal is turned off in conciv({quickTerminal: false}).'),
    ).toHaveLength(2)
    expect(screen.getByRole('button', {name: /^Quick terminal/})).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Open or close conciv'})).toBeEnabled()
  })
})

describe('a scripted reply that hangs, in browser mode', () => {
  test('TestLLM.hang() reaches the engine and holds the run open until the session stops it, then the next reply answers', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.hang(), TestLLM.text('After the stop'))
    const gate = await engine.gate()

    const hung = engine.session.send('Wait for it')
    await gate.started
    await gate.release()
    await engine.session.stop()
    await hung

    await expect(engine.session.send('Go on')).resolves.toBeUndefined()
  })
})

describe('waiting for an engine event that matches, in browser mode', () => {
  test('the data to match crosses to the engine, which passes over an earlier event and resolves with the one that matches', async () => {
    const engine = await createEngine()
    const other = await engine.newSession('Other')
    const wait = await engine.event('session.execution.succeeded', {data: {sessionID: other.id}})
    await engine.reply(TestLLM.text('First'), TestLLM.text('Second'))

    await engine.session.send('In the first session')
    await other.send('In the other session')

    expect(await wait.arrived).toEqual({type: 'session.execution.succeeded', data: {sessionID: other.id}})
  })
})

describe('the served whiteboard in the real app', () => {
  const PAGE = '@conciv/plugin-page'
  const WHITEBOARD = '@conciv/plugin-whiteboard'

  test('the agent drafts, previews, publishes, exports and discards a sketch with a card per step, and a destructive step asks first', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [WHITEBOARD]}, {post: [PAGE]})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode:
          "await external_whiteboard_canvas_draw({elements: [{type: 'rectangle', id: 'cart', x: 0, y: 0, width: 120, height: 60}, {type: 'rectangle', id: 'pay', x: 240, y: 0, width: 120, height: 60}]}); await external_whiteboard_canvas_connect({fromId: 'cart', toId: 'pay'}); return await external_whiteboard_canvas_update({elementId: 'cart', patch: {backgroundColor: '#ffc9c9'}})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode:
          'await external_whiteboard_canvas_preview({}); return await external_whiteboard_canvas_commit({})',
      }),
      TestLLM.toolCall('c3', 'execute_typescript', {
        typescriptCode: "return await external_whiteboard_canvas_export({format: 'png', scope: 'live'})",
      }),
      TestLLM.toolCall('c4', 'execute_typescript', {
        typescriptCode:
          'await external_whiteboard_canvas_svg({svg: \'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect x="0" y="0" width="100" height="50" fill="#a5d8ff" stroke="#1971c2" stroke-width="2"/></svg>\', x: 0, y: 200}); await external_whiteboard_canvas_diagram({mermaid: \'flowchart LR\\n  Cart --> Pay\'}); return await external_whiteboard_canvas_discard({})',
      }),
      TestLLM.text('The checkout sketch is on the canvas'),
      TestLLM.toolCall('c5', 'execute_typescript', {
        typescriptCode: "return await external_whiteboard_canvas_delete({elementId: 'pay'})",
      }),
      TestLLM.toolCall('c6', 'execute_typescript', {
        typescriptCode: 'return await external_whiteboard_canvas_clear({})',
      }),
      TestLLM.text('I removed the pay step and kept the rest'),
    )
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    expect(await screen.findByRole('button', {name: /^Comments/})).toBeVisible()
    const input = screen.getByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Sketch the checkout flow')
    await expect.element(input).toHaveFocus()
    const sketchedTurn = await engine.event('session.execution.succeeded')
    await user.keyboard('{Enter}')
    await sketchedTurn.arrived

    expect(await screen.findByText('The checkout sketch is on the canvas')).toBeVisible()
    const sketch = screen.getByRole('article', {name: 'Reply to: Sketch the checkout flow'})
    expect(within(sketch).getByText('whiteboard_canvas_draw')).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_draw\s*2 elements to draft/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_connect\s*cart → pay/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_update\s*updated cart/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_preview\s*3 elements/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_commit\s*3 published/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_svg\s*svg to draft/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_diagram\s*mermaid to draft/})).toBeVisible()
    expect(within(sketch).getByRole('button', {name: /whiteboard_canvas_discard\s*\d+ discarded/})).toBeVisible()
    expect(await within(sketch).findByRole('img', {name: 'canvas export'})).toBeVisible()
    const sketched = (await engine.requests()).at(-1)
    const committed = sketched?.messages.find((message) => message.toolCallId === 'c2')
    expect(JSON.parse(String(committed?.content))).toMatchObject({
      success: true,
      result: {committed: true, elements: 3},
    })
    const exported = sketched?.messages.find((message) => message.toolCallId === 'c3')
    expect(JSON.parse(String(exported?.content))).toMatchObject({
      success: true,
      result: {scope: 'live'},
      files: expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          source: expect.objectContaining({type: 'data', mimeType: 'image/png'}),
        }),
      ]),
    })

    await user.type(input, 'Remove the pay step and clear the rest')
    await expect.element(input).toHaveFocus()
    const tidiedTurn = await engine.event('session.execution.succeeded')
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('button', {name: 'Allow once'}))
    const tidy = await screen.findByRole('article', {name: 'Reply to: Remove the pay step and clear the rest'})
    expect(await within(tidy).findByText('pay')).toBeVisible()
    await user.click(await screen.findByRole('button', {name: 'Deny'}))
    await tidiedTurn.arrived

    expect(await screen.findByText('I removed the pay step and kept the rest')).toBeVisible()
    expect(within(tidy).getByText('whiteboard_canvas_clear')).toBeVisible()
    const live = await engine.session.tool('whiteboard_canvas_read').call({scope: 'live'})
    expect(live).toHaveProperty('elements.length', 2)
    expect(live).toMatchObject({
      scope: 'live',
      elements: expect.arrayContaining([
        expect.objectContaining({id: 'cart', backgroundColor: '#ffc9c9'}),
        expect.objectContaining({type: 'arrow'}),
      ]),
    })
  })

  test('the user finds, sorts, marks read, answers, resolves and deletes threads, the agent reads the answer and lists what is left, and Escape closes one layer at a time', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [WHITEBOARD]}, {post: [PAGE]})
    const create = engine.session.tool('whiteboard_comment_create')
    await create.call({
      cid: 'price',
      kind: 'floating',
      parts: [{type: 'text', text: 'The price wraps on small screens'}],
      x: 120,
      y: 160,
      authorKind: 'ai',
      authorModel: 'Opus 5.5',
    })
    await create.call({
      cid: 'hero',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'The hero image is blurry'}],
      anchor: {source: {file: 'src/hero.tsx', line: 12}},
      x: 420,
      y: 160,
      authorKind: 'ai',
      authorModel: 'Opus 5.5',
    })
    await engine.session.tool('whiteboard_comment_reply').call({
      cid: 'hero',
      parts: [{type: 'text', text: 'A sharper export is ready'}],
    })
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_whiteboard_comment_read({cid: 'hero'})",
      }),
      TestLLM.toolCall('c2', 'execute_typescript', {
        typescriptCode: 'return await external_whiteboard_comment_list({})',
      }),
      TestLLM.text('I read your reply, and only the resolved hero comment is left'),
    )
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    const toggle = await screen.findByRole('button', {name: /^Comments/})
    expect(within(toggle).getByText('2')).toBeVisible()
    expect(await screen.findAllByRole('button', {name: 'AI comment, open, unread'})).toHaveLength(2)
    expect(screen.getByText('hero.tsx:12')).toBeVisible()
    expect(screen.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()

    await user.click(toggle)
    const inbox = await screen.findByRole('complementary', {name: 'Comments inbox'})
    const inboxRows = page.getByRole('complementary', {name: 'Comments inbox'})
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()
    const search = within(inbox).getByRole('searchbox', {name: 'Quick search'})
    await user.type(search, 'blurry')
    await expect
      .element(inboxRows.getByRole('button', {name: /The price wraps on small screens/}))
      .not.toBeInTheDocument()
    expect(within(inbox).getByRole('button', {name: /The hero image is blurry/})).toBeVisible()
    await user.clear(search)
    expect(await within(inbox).findByRole('button', {name: /The price wraps on small screens/})).toBeVisible()
    await user.type(search, 'checkout')
    expect(await within(inbox).findByText('No comments match “checkout”.')).toBeVisible()
    await user.clear(search)

    await user.click(await within(inbox).findByRole('button', {name: /The hero image is blurry/}))
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Comment thread'})).getByRole('button', {name: 'Close thread'}),
    )
    expect(await screen.findByRole('button', {name: 'AI comment, open, unread'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'AI comment, open'})).toBeVisible()
    const byDate = within(inbox).getAllByRole('button', {
      name: /The hero image is blurry|The price wraps on small screens/,
    })
    expect(byDate[0]).toHaveAccessibleName(/The hero image is blurry/)
    expect(within(inbox).getByText('1 reply')).toBeVisible()
    await user.click(within(inbox).getByRole('button', {name: 'Filter comments'}))
    await user.click(await screen.findByRole('menuitemradio', {name: 'Sort by unread'}))
    await expect
      .element(
        inboxRows.getByRole('button', {name: /The hero image is blurry|The price wraps on small screens/}).first(),
      )
      .toHaveAccessibleName(/The price wraps on small screens/)
    await user.click(within(inbox).getByRole('button', {name: 'Mark all as read'}))
    await expect.element(page.getByRole('button', {name: 'AI comment, open, unread'})).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', {name: 'AI comment, open'})).toHaveLength(2)

    await user.click(within(inbox).getByRole('button', {name: /The hero image is blurry/}))
    const thread = await screen.findByRole('dialog', {name: 'Comment thread'})
    expect(within(thread).getByText('The hero image is blurry')).toBeVisible()
    const reply = within(thread).getByRole('textbox', {name: 'Reply'})
    await expect.element(reply).toHaveFocus()
    await user.type(reply, 'On it @Opus')
    expect(await screen.findByRole('option', {name: 'Opus 5.5'})).toBeVisible()
    expect(reply).toHaveFocus()
    await user.keyboard('{Tab}')
    expect(await within(reply).findByText('@Opus 5.5')).toBeVisible()
    expect(reply).toHaveFocus()
    await user.keyboard('{Enter}')
    const answer = await within(thread).findByText('On it')
    expect(answer).toHaveTextContent('On it @Opus 5.5')
    expect(answer).toBeVisible()

    await user.click(within(thread).getByRole('button', {name: 'Previous thread'}))
    expect(await within(thread).findByText('The price wraps on small screens')).toBeVisible()
    await user.click(within(thread).getByRole('button', {name: 'Next thread'}))
    expect(await within(thread).findByText('The hero image is blurry')).toBeVisible()
    const heroReply = within(thread).getByRole('textbox', {name: 'Reply'})
    await user.click(heroReply)
    await expect.element(heroReply).toHaveFocus()
    await user.keyboard('{Escape}')
    await expect.element(page.getByRole('dialog', {name: 'Comment thread'})).not.toBeInTheDocument()
    expect(inbox).toBeVisible()

    await user.click(within(inbox).getByRole('button', {name: /The hero image is blurry/}))
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Comment thread'})).getByRole('button', {name: 'Resolve thread'}),
    )
    await expect.element(inboxRows.getByRole('button', {name: /The hero image is blurry/})).not.toBeInTheDocument()
    expect(await screen.findByRole('button', {name: 'AI comment, resolved'})).toBeVisible()
    await user.click(within(inbox).getByRole('button', {name: 'Filter comments'}))
    await user.click(await screen.findByRole('menuitemcheckbox', {name: 'Show resolved comments'}))
    expect(await within(inbox).findByRole('button', {name: /The hero image is blurry/})).toBeVisible()

    await user.click(within(inbox).getByRole('button', {name: /The price wraps on small screens/}))
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Comment thread'})).getByRole('button', {name: 'Delete thread'}),
    )
    const confirm = await screen.findByRole('dialog', {name: 'Delete this thread?'})
    await user.click(within(confirm).getByRole('button', {name: 'Delete'}))
    await expect
      .element(inboxRows.getByRole('button', {name: /The price wraps on small screens/}))
      .not.toBeInTheDocument()
    await expect.element(page.getByRole('button', {name: /^AI comment, open/})).not.toBeInTheDocument()
    await user.click(within(inbox).getByRole('button', {name: 'Close inbox'}))

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Did you see my reply, and what is left on the board?')
    await expect.element(input).toHaveFocus()
    const turn = await engine.event('session.execution.succeeded')
    await user.keyboard('{Enter}')
    await turn.arrived
    expect(await screen.findByText('I read your reply, and only the resolved hero comment is left')).toBeVisible()
    const messages = (await engine.requests()).at(-1)?.messages
    const read = messages?.find((message) => message.toolCallId === 'c1')
    expect(JSON.parse(String(read?.content))).toMatchObject({
      success: true,
      result: {
        comment: {cid: 'hero'},
        replies: [
          {parts: [{type: 'text', text: 'A sharper export is ready'}]},
          {
            authorKind: 'human',
            parts: expect.arrayContaining([expect.objectContaining({type: 'mention', label: 'Opus 5.5'})]),
          },
        ],
      },
    })
    const listed = messages?.find((message) => message.toolCallId === 'c2')
    expect(JSON.parse(String(listed?.content))).toMatchObject({
      success: true,
      result: {comments: [{cid: 'hero', status: 'resolved'}]},
    })

    expect(input).toHaveFocus()
    await user.keyboard('{Escape}')
    await expect.element(page.getByRole('button', {name: /^Comments/})).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', {name: /^AI comment/})).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })

  test('a floating pin moves where it is dropped, and a source pin asks first, keeping its link or cutting it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [WHITEBOARD]}, {post: [PAGE]})
    const room = engine.session.id
    const create = engine.session.tool('whiteboard_comment_create')
    await create.call({
      cid: 'shelf',
      kind: 'floating',
      parts: [{type: 'text', text: 'The shelf needs more space'}],
      x: 200,
      y: 200,
      authorKind: 'ai',
    })
    await create.call({
      cid: 'cart',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'The cart badge overlaps'}],
      anchor: {source: {file: 'src/cart.tsx', line: 8}},
      x: 500,
      y: 200,
      authorKind: 'human',
    })
    await mount({engine, history: createEngineRouterHistory({initialEntries: [`/panel/${room}?open=true`]})})
    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))

    const shelf = await screen.findByRole('button', {name: 'AI comment, open, unread'})
    const shelfMoved = await engine.event('rpc.whiteboard.changed')
    await user.pointer([
      {keys: '[MouseLeft>]', target: shelf, coords: {clientX: 200, clientY: 200}},
      {coords: {clientX: 260, clientY: 290}},
      {keys: '[/MouseLeft]'},
    ])
    expect((await shelfMoved.arrived).data).toMatchObject({table: 'pins', type: 'upsert'})
    expect(await engine.rpc.call('whiteboard', 'pins.list', {room})).toEqual(
      expect.arrayContaining([expect.objectContaining({cid: 'shelf', x: 260, y: 290, pinState: 'locked'})]),
    )
    expect(screen.queryByRole('dialog', {name: 'Pin drift'})).not.toBeInTheDocument()

    const cart = screen.getByRole('button', {name: 'Human comment, open, unread'})
    expect(within(cart).getByText('cart.tsx:8')).toBeVisible()
    await user.pointer([
      {keys: '[MouseLeft>]', target: cart, coords: {clientX: 500, clientY: 200}},
      {coords: {clientX: 540, clientY: 260}},
      {keys: '[/MouseLeft]'},
    ])
    const drift = await screen.findByRole('dialog', {name: 'Pin drift'})
    expect(within(drift).getByRole('heading', {name: 'cart.tsx:8'})).toBeVisible()
    const kept = await engine.event('rpc.whiteboard.changed')
    await user.click(within(drift).getByRole('button', {name: 'Keep link, accept drift'}))
    expect((await kept.arrived).data).toMatchObject({table: 'pins', type: 'upsert'})
    expect(await engine.rpc.call('whiteboard', 'pins.list', {room})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({cid: 'cart', x: 540, y: 260, pinState: 'offset', anchorX: 500, anchorY: 200}),
      ]),
    )
    expect(within(cart).getByText('cart.tsx:8')).toBeVisible()

    await user.pointer([
      {keys: '[MouseLeft>]', target: cart, coords: {clientX: 540, clientY: 260}},
      {coords: {clientX: 600, clientY: 300}},
      {keys: '[/MouseLeft]'},
    ])
    await user.click(
      within(await screen.findByRole('dialog', {name: 'Pin drift'})).getByRole('button', {
        name: 'Disconnect from source',
      }),
    )
    await expect.element(cart).not.toHaveTextContent('cart.tsx:8')
    await expect.element(page.getByRole('dialog', {name: 'Pin drift'})).not.toBeInTheDocument()
  })

  test('switching sessions swaps the board, and a board left without a tab keeps its draft when the commit times out', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [[WHITEBOARD, {commitDeadlineMs: 200}]]}, {post: [PAGE]})
    const alpha = await engine.newSession('Alpha')
    const beta = await engine.newSession('Beta')
    await alpha.tool('whiteboard_comment_create').call({
      cid: 'alpha-note',
      kind: 'floating',
      parts: [{type: 'text', text: 'Alpha checkout note'}],
      x: 100,
      y: 100,
      authorKind: 'ai',
    })
    await beta.tool('whiteboard_comment_create').call({
      cid: 'beta-note',
      kind: 'floating',
      parts: [{type: 'text', text: 'Beta header note'}],
      x: 100,
      y: 100,
      authorKind: 'ai',
    })
    await beta.tool('whiteboard_comment_create').call({
      cid: 'beta-footer',
      kind: 'floating',
      parts: [{type: 'text', text: 'Beta footer note'}],
      x: 300,
      y: 100,
      authorKind: 'ai',
    })
    await mount({engine, history: createEngineRouterHistory({initialEntries: [`/panel/${alpha.id}?open=true`]})})

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    await user.click(await screen.findByRole('button', {name: /^Comments/}))
    const alphaInbox = await screen.findByRole('complementary', {name: 'Comments inbox'})
    expect(within(alphaInbox).getByText('Alpha checkout note')).toBeVisible()
    expect(within(alphaInbox).queryByText('Beta header note')).not.toBeInTheDocument()
    expect(
      await alpha.tool('whiteboard_canvas_draw').call({
        elements: [{type: 'rectangle', id: 'alpha-box', x: 0, y: 0, width: 80, height: 40}],
      }),
    ).toHaveProperty('pending')
    await user.click(within(alphaInbox).getByRole('button', {name: 'Close inbox'}))

    await user.click(await screen.findByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('option', {name: /Beta/}))
    expect(await screen.findByRole('button', {name: 'Beta, session options'})).toBeVisible()
    await user.click(await screen.findByRole('button', {name: /^Comments\s*2/}))
    const betaInbox = await screen.findByRole('complementary', {name: 'Comments inbox'})
    expect(await within(betaInbox).findByText('Beta header note')).toBeVisible()
    expect(within(betaInbox).queryByText('Alpha checkout note')).not.toBeInTheDocument()

    expect(await alpha.tool('whiteboard_canvas_commit').failure({})).toMatchObject({
      message: expect.stringContaining('commit timed out: no canvas tab is connected to perform it'),
    })
    expect(await alpha.tool('whiteboard_canvas_read').call({scope: 'draft'})).toMatchObject({
      scope: 'draft',
      elements: [{id: 'alpha-box', type: 'rectangle'}],
    })
  })

  test('the canvas background row starts on, and the choice holds after leaving settings', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: [WHITEBOARD]}, {post: [PAGE]})
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    const general = await screen.findByRole('tab', {name: 'General', selected: true})
    const background = await screen.findByRole('switch', {name: 'Canvas background: see the page through the canvas'})
    expect(background).toBeChecked()
    await user.click(background)
    await expect.element(background).not.toBeChecked()

    await user.click(general)
    await expect.element(general).toHaveFocus()
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    expect(await screen.findByRole('tab', {name: 'General', selected: true})).toBeVisible()
    expect(
      await screen.findByRole('switch', {name: 'Canvas background: see the page through the canvas'}),
    ).not.toBeChecked()
  })

  test('with the canvas open a picked element gets its comment straight onto the board with no toast, and with the canvas closed the user is told it was added and finds it on the board', async () => {
    const user = userEvent.setup()
    await page.viewport(1280, 800)
    const engine = await createEngine({plugins: [WHITEBOARD]}, {post: [PAGE]})
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })
    render(() => (
      <>
        <h1>Plant shop</h1>
        <button type="button" id="buy">
          Buy the fern
        </button>
      </>
    ))

    const whiteboard = await screen.findByRole('button', {name: 'Open the whiteboard canvas'})
    await user.click(whiteboard)
    expect(await screen.findByRole('button', {name: /^Comments/})).toBeVisible()
    await user.click(await screen.findByRole('button', {name: 'Comment on an element'}))
    // oxlint-disable-next-line conciv/no-forced-click -- the picker turns page pointer events off while it picks; approved by the maintainer
    await browserInput.click(screen.getByRole('heading', {name: 'Plant shop'}), {force: true})
    const tagline = await screen.findByRole('dialog', {name: 'New comment'})
    await user.type(within(tagline).getByRole('textbox', {name: 'Comment'}), 'The title needs a tagline')
    const added = await engine.event('rpc.whiteboard.changed')
    await user.click(within(tagline).getByRole('button', {name: 'Add comment'}))
    expect(await screen.findByRole('button', {name: /^Human comment, open/})).toBeVisible()
    await added.arrived
    expect(screen.queryByText('Comment added to the whiteboard')).not.toBeInTheDocument()
    const thread = await screen.findByRole('dialog', {name: 'Comment thread'})
    expect(within(thread).getByText('The title needs a tagline')).toBeVisible()
    await user.click(within(thread).getByRole('button', {name: 'Close thread'}))

    await user.click(whiteboard)
    await expect.element(page.getByRole('button', {name: /^Comments/})).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', {name: 'Comment on an element'}))
    // oxlint-disable-next-line conciv/no-forced-click -- the picker turns page pointer events off while it picks; approved by the maintainer
    await browserInput.click(screen.getByRole('button', {name: 'Buy the fern'}), {force: true})
    const compose = await screen.findByRole('dialog', {name: 'New comment'})
    const comment = within(compose).getByRole('textbox', {name: 'Comment'})
    await expect.element(comment).toHaveFocus()
    await user.type(comment, 'Make this button green')
    await user.click(within(compose).getByRole('button', {name: 'Add comment'}))

    expect(await screen.findByText('Comment added to the whiteboard')).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'New comment'})).not.toBeInTheDocument()
    expect(await engine.session.tool('whiteboard_comment_list').call({})).toMatchObject({
      comments: expect.arrayContaining([
        expect.objectContaining({
          authorKind: 'human',
          parts: [expect.objectContaining({type: 'text', text: 'Make this button green'})],
        }),
      ]),
    })
    await user.click(screen.getByRole('button', {name: 'Open the whiteboard canvas'}))
    expect(await screen.findAllByRole('button', {name: /^Human comment, open/})).toHaveLength(2)
  })

  test('the user draws a rectangle with the canvas tools, it is saved to the shared board, the agent reads it, and real clicks still reach the chat composer and Settings', async () => {
    const user = userEvent.setup()
    await page.viewport(1280, 800)
    const engine = await createEngine({plugins: [WHITEBOARD]}, {post: [PAGE]})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: 'return await external_whiteboard_canvas_read({})',
      }),
      TestLLM.text('I see the rectangle you drew'),
    )
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    const canvas = page.getByRole('region', {name: 'Whiteboard canvas'})
    await browserInput.click(canvas, {position: {x: 300, y: 300}})
    await browserInput.keyboard('r')
    await expect.element(page.getByRole('radio', {name: 'Rectangle'})).toBeChecked()
    const saved = await engine.event('rpc.whiteboard.changed')
    await browserInput.dragAndDrop(canvas, canvas, {
      sourcePosition: {x: 300, y: 300},
      targetPosition: {x: 500, y: 440},
    })
    expect((await saved.arrived).data).toMatchObject({table: 'canvasElements', type: 'upsert'})

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await browserInput.click(input)
    await expect.element(input).toHaveFocus()
    await browserInput.keyboard('What did I draw?')
    await expect.element(input).toHaveFocus()
    const readTurn = await engine.event('session.execution.succeeded')
    await browserInput.keyboard('{Enter}')
    await readTurn.arrived

    expect(await screen.findByText('I see the rectangle you drew')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: What did I draw?'})
    expect(within(reply).getByRole('button', {name: /whiteboard_canvas_read\s*1 element/})).toBeVisible()
    const read = (await engine.requests()).at(-1)?.messages.find((message) => message.toolCallId === 'c1')
    expect(JSON.parse(String(read?.content))).toMatchObject({
      success: true,
      result: {scope: 'live', elements: [{type: 'rectangle', isDeleted: false}]},
    })

    await browserInput.click(page.getByRole('link', {name: 'Settings'}))
    await expect.element(page.getByRole('heading', {name: 'Settings'})).toBeVisible()
  })

  test('with a shape tool picked the board shows no properties panel, library or help, and keeps its toolbar, menu, comments and zoom', async () => {
    const user = userEvent.setup()
    await page.viewport(1280, 800)
    const engine = await createEngine({plugins: [WHITEBOARD]}, {post: [PAGE]})
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    await user.click(await screen.findByRole('button', {name: 'Open the whiteboard canvas'}))
    await browserInput.click(page.getByRole('region', {name: 'Whiteboard canvas'}), {position: {x: 300, y: 300}})
    await browserInput.keyboard('r')
    await expect.element(page.getByRole('radio', {name: 'Rectangle'})).toBeChecked()

    await expect.element(page.getByRole('region', {name: 'Selected shape actions', exact: true})).not.toBeInViewport()
    await expect.element(page.getByRole('checkbox', {name: 'Library', exact: true})).not.toBeInViewport()
    await expect.element(page.getByRole('button', {name: 'Help', exact: true})).not.toBeInViewport()

    await expect.element(page.getByRole('region', {name: 'Shapes', exact: true})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: '', exact: true})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: /^Comments/})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: 'Zoom in', exact: true})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: 'Reset zoom', exact: true})).toBeInViewport()
    await expect.element(page.getByRole('button', {name: 'Zoom out', exact: true})).toBeInViewport()
  })
})
