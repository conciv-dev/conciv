import {describe, expect, test} from 'vitest'
import {screen, within, render} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createORPCClient} from '@orpc/client'
import {createFakeEngine, type FakePluginInfo} from '@internal/test-utils'
import type {EngineClient} from '@conciv/client'
import {Plugin} from '@conciv/frontend-plugin-api'
import {mountShell, shellEngine} from '../utils/mount-shell.js'
import {localBundle} from '../utils/sample-plugins.js'
import releaseTrain from '../fixtures/plugins/release-train/plugin-experimental.js?raw'
import shellBoard from '../fixtures/plugins/shell-board/plugin-experimental.js?raw'
import terminal from '../fixtures/plugins/terminal/plugin-experimental.js?raw'
import {userEvent as browserInput, userEvent as browserUserEvent} from 'vitest/browser'
import {createMemoryHistory} from '@tanstack/solid-router'
import {createEventBusClient, PANEL_PLUGIN_ID, type PanelCommandEventMap} from '@conciv/types/event-bus'

describe('moving around settings', () => {
  test('settings open on General, then on the last section the user left', async () => {
    const user = userEvent.setup()
    await mountShell({engine: shellEngine()})

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
    const engine = shellEngine(createFakeEngine({settings: {'global:conciv': {colorScheme: 'dark'}}}))
    const otherClient = createORPCClient<EngineClient>(engine.connect().link)
    await mountShell({engine})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))

    expect(await screen.findByRole('radio', {name: 'Dark'})).toBeChecked()
    expect(screen.getByText('From all projects')).toBeVisible()

    await user.click(screen.getByRole('switch', {name: 'All projects'}))
    expect(await screen.findByRole('switch', {name: 'All projects', checked: true})).toBeChecked()
    expect(screen.getByRole('radio', {name: 'Dark'})).toBeChecked()
    expect(screen.queryByText('From all projects')).not.toBeInTheDocument()

    await otherClient.settings.set({scope: 'project', namespace: 'conciv', key: 'colorScheme', value: 'light'})
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
    await mountShell({
      engine: shellEngine(
        createFakeEngine({
          settings: {'project:conciv': {commandShortcuts: {togglePanel: ['Mod+K']}, colorScheme: 'dark'}},
        }),
      ),
    })
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
    await mountShell({
      engine: shellEngine(
        createFakeEngine({
          settings: {'global:plugin-enable': {'release-train': false}},
          bundles: [localBundle('release-train', releaseTrain, {server: true})],
        }),
      ),
    })
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
    const releaseTrainBundle = localBundle('release-train', releaseTrain, {server: true})
    const engine = shellEngine(createFakeEngine({bundles: [releaseTrainBundle]}))
    await mountShell({engine})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Plugins'}))
    expect(await screen.findByRole('switch', {name: 'release-train'})).toBeVisible()
    expect(screen.queryByText('desk-notes')).not.toBeInTheDocument()

    engine.setBundles([releaseTrainBundle, localBundle('desk-notes', terminal)])

    expect(await screen.findByText('desk-notes')).toBeVisible()
    expect(screen.getByRole('switch', {name: 'release-train'})).toBeVisible()
  })

  test('a plugin page joins the sections and its section shows in General, an unknown plugin page opens General, a plugin under a built-in ID is not loaded, and a plugin the engine failed to set up shows the option it refused', async () => {
    const user = userEvent.setup()
    const tanstack: FakePluginInfo = {
      source: {type: 'package', target: '@conciv/plugin-tanstack'},
      features: {server: true},
      state: {status: 'failed', error: 'Invalid option bundlerWaitMs: expected a number of at least 1, received 0'},
      options: {bundlerWaitMs: 0},
    }
    await mountShell({
      engine: shellEngine(
        createFakeEngine({
          sessions: [{id: 'ses_desk', title: 'Desk'}],
          bundles: [localBundle('shell-board', shellBoard), localBundle('terminal', terminal), {info: tanstack}],
        }),
      ),
      plugins: [{id: 'terminal', plugin: Plugin.define({setup: () => undefined}), builtin: true}],
      initialEntries: ['/panel/ses_desk/settings/plugins/nowhere?open=true'],
    })

    expect(await screen.findByRole('tab', {name: 'General', selected: true})).toBeVisible()
    expect(await screen.findByText('Deploy notes live here')).toBeVisible()

    await user.click(screen.getByRole('tab', {name: 'Deploy targets'}))
    expect(await screen.findByText('Ship to staging first')).toBeVisible()
    expect(screen.getByRole('tab', {name: 'Deploy targets', selected: true})).toBeVisible()

    await user.click(screen.getByRole('tab', {name: 'Plugins'}))
    expect(await screen.findByText('Not loaded. A built-in plugin already uses this ID.')).toBeVisible()
    expect(await screen.findByText(/bundlerWaitMs/)).toBeVisible()
    expect(screen.getByText('Failed')).toBeVisible()
  })
})

describe('the general settings change the panel', () => {
  test('the user picks a colour mode, a skin, hides the launcher and brings it back, and closes the panel with a page click, and the host closes it while it opens', async () => {
    const user = userEvent.setup()
    const history = createMemoryHistory({initialEntries: ['/panel/latest?open=true']})
    await mountShell({engine: shellEngine(), history})
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
    const panelCommands = createEventBusClient<PanelCommandEventMap>({pluginId: PANEL_PLUGIN_ID, target: () => window})
    panelCommands.emit('open', undefined)
    panelCommands.emit('close', undefined)
    expect(await closed.promise).toMatch(/^\/panel\//)
    unsubscribe()
    panelCommands.dispose()
    expect(screen.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    await expect.element(panel).not.toBeVisible()
  })

  test('a project that chose to open on page load shows the panel when the page loads', async () => {
    await mountShell({
      engine: shellEngine(createFakeEngine({settings: {'project:conciv': {openOnLoad: true}}})),
      initialEntries: ['/'],
    })

    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })

  test('a launcher and an open on load set by the page are shown locked in settings', async () => {
    const user = userEvent.setup()
    await mountShell({engine: shellEngine(), settings: {launcher: 'native', defaultOpen: true}, initialEntries: ['/']})

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
    await mountShell({engine: shellEngine()})
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
    await mountShell({engine: shellEngine()})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))

    expect(await screen.findByText('Set by the page in --conciv-skin')).toBeVisible()
    expect(screen.getByRole('radio', {name: 'Terminal'})).toBeChecked()
  })

  test('a page skin neon that conciv does not ship is not taken, and the Skin row keeps the user choice', async () => {
    const user = userEvent.setup()
    render(() => <style>{'body { --conciv-skin: neon; }'}</style>)
    await mountShell({engine: shellEngine()})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))

    expect(await screen.findByRole('radio', {name: 'Conciv'})).toBeChecked()
    expect(screen.queryByText('Set by the page in --conciv-skin')).not.toBeInTheDocument()
  })
})

describe('recording keyboard shortcuts', () => {
  test('the user records a new panel key that then works, clears one, cancels one and moves a clashing one', async () => {
    const user = userEvent.setup()
    await mountShell({engine: shellEngine()})
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
    await mountShell({engine: shellEngine(), settings: {quickTerminal: false}})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Shortcuts'}))

    expect(
      await screen.findAllByText('The quick terminal is turned off in conciv({quickTerminal: false}).'),
    ).toHaveLength(2)
    expect(screen.getByRole('button', {name: /^Quick terminal/})).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Open or close conciv'})).toBeEnabled()
  })
})
