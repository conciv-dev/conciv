import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

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
    expect(await screen.findByRole('switch', {name: 'All projects'})).toBeChecked()
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
    expect(await screen.findByText('Ctrl+Period')).toBeVisible()
    expect(screen.queryByText('Ctrl+K')).not.toBeInTheDocument()

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
    const engine = await createEngine({plugins: ['@conciv/plugin-tanstack']})
    await engine.setting({scope: 'global', namespace: 'plugin-enable', key: 'tanstack', value: false})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Plugins'}))
    expect(await screen.findByRole('switch', {name: 'tanstack', checked: false})).toBeVisible()
    expect(screen.getByText('Server')).toBeVisible()

    await user.click(screen.getByRole('switch', {name: 'tanstack'}))
    await user.click(screen.getByRole('button', {name: 'Back to chat'}))
    expect(await screen.findByRole('status', {name: 'TanStack inspector active'})).toBeVisible()
  })

  test('a plugin added to the project while the Plugins section is open joins the list', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-tanstack']}, {fs: {filewatcher: true}})
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
    await user.click(await screen.findByRole('link', {name: 'Settings'}))
    await user.click(await screen.findByRole('tab', {name: 'Plugins'}))
    expect(await screen.findByRole('switch', {name: 'tanstack'})).toBeVisible()
    expect(screen.queryByRole('switch', {name: 'desk-notes'})).not.toBeInTheDocument()

    await engine.write('conciv/plugins/desk-notes.js', "export default {id: 'desk-notes', setup: () => undefined}\n")

    expect(await screen.findByRole('switch', {name: 'desk-notes'})).toBeVisible()
    expect(screen.getByRole('switch', {name: 'tanstack'})).toBeVisible()
  })

  test('a plugin page joins the sections and its section shows in General, an unknown plugin page opens General, and a plugin under a built-in ID is not loaded', async () => {
    const user = userEvent.setup()
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/shell-board', './test/fixtures/plugins/terminal'],
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
