import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {defineExtension} from '@conciv/extension'
import {getHotkeyManager} from '@tanstack/solid-hotkeys'
import {installFakeCore, type FakeCore} from './helpers/fake-core.js'
import {mountApp} from './helpers/app-harness.js'

const disposers: (() => void)[] = []
let core: FakeCore | null = null

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  core?.restore()
  core = null
})

const mod = navigator.platform.startsWith('Mac') ? 'Meta' : 'Control'
const pressTogglePanel = () => userEvent.keyboard(`{${mod}>}/{/${mod}}`)
const pressFocusComposer = () => userEvent.keyboard('{Shift>}{Escape}{/Shift}')
const pressSessionSwitcher = () => userEvent.keyboard(`{${mod}>}{Shift>}S{/Shift}{/${mod}}`)
const pressTerminalToggle = () => userEvent.keyboard(`{${mod}>}{Alt>}T{/Alt}{/${mod}}`)

function fakeTerminalExtension() {
  return defineExtension({
    name: 'fake-terminal',
    views: [{id: 'terminal', label: 'Terminal', Component: () => <div>fake terminal surface</div>}],
  }).client(() => ({value: {}}))
}

function start(config: {extensions?: ReturnType<typeof fakeTerminalExtension>[]; initialPath?: string} = {}): void {
  core = installFakeCore()
  const mounted = mountApp(config)
  disposers.push(mounted.dispose)
}

const panel = () => page.getByRole('dialog', {name: 'conciv chat agent'})
const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

test('Mod+/ opens the panel from the closed shell and closes it again', async () => {
  start()

  await pressTogglePanel()
  await expect.element(panel()).toBeVisible()

  await pressTogglePanel()
  await expect.element(panel()).not.toBeInTheDocument()
})

test('Shift+Escape opens the panel and lands typing focus in the composer', async () => {
  start()

  await pressFocusComposer()
  await expect.element(panel()).toBeVisible()
  await expect.element(composer()).toBeVisible()

  await userEvent.keyboard('hello agent')
  await expect.element(composer()).toHaveValue('hello agent')
})

test('Shift+Escape moves focus to the composer while the panel is already open', async () => {
  start({initialPath: '/panel/conciv_1?open=true'})
  await expect.element(composer()).toBeVisible()
  await page.getByText('conciv', {exact: true}).click()

  await pressFocusComposer()
  await userEvent.keyboard('typed after chord')
  await expect.element(composer()).toHaveValue('typed after chord')
})

test('Mod+Shift+S opens the session switcher with the search field taking keystrokes', async () => {
  start({initialPath: '/panel/conciv_1?open=true'})
  await expect.element(composer()).toBeVisible()

  await pressSessionSwitcher()
  await expect.element(page.getByPlaceholder('Search sessions…')).toBeVisible()

  await userEvent.keyboard('rename')
  await expect.element(page.getByPlaceholder('Search sessions…')).toHaveValue('rename')
})

test('Mod+Alt+T switches the panel to the terminal view and back to chat', async () => {
  start({extensions: [fakeTerminalExtension()], initialPath: '/panel/conciv_1?open=true'})
  await expect.element(page.getByRole('tab', {name: 'Chat'})).toHaveAttribute('aria-selected', 'true')

  await pressTerminalToggle()
  await expect.element(page.getByRole('tab', {name: 'Terminal'})).toHaveAttribute('aria-selected', 'true')

  await pressTerminalToggle()
  await expect.element(page.getByRole('tab', {name: 'Chat'})).toHaveAttribute('aria-selected', 'true')
})

test('Mod+Alt+T stays inert while the composer has typing focus', async () => {
  start({extensions: [fakeTerminalExtension()], initialPath: '/panel/conciv_1?open=true'})
  await composer().click()
  await userEvent.keyboard('mid-thought')
  await expect.element(composer()).toHaveValue('mid-thought')

  await pressTerminalToggle()
  await expect.element(composer()).toHaveValue('mid-thought')
  await expect.element(page.getByRole('tab', {name: 'Chat'})).toHaveAttribute('aria-selected', 'true')
})

test('unmounting the app unregisters every app-level chord', async () => {
  start({extensions: [fakeTerminalExtension()], initialPath: '/panel/conciv_1?open=true'})
  await expect.element(composer()).toBeVisible()
  const chords = () => [...getHotkeyManager().registrations.state.values()].map((registration) => registration.hotkey)
  expect(chords()).toContain('Mod+/')
  expect(chords()).toContain('Shift+Escape')

  for (const dispose of disposers.splice(0)) dispose()

  await expect.element(panel()).not.toBeInTheDocument()
  expect(chords()).toEqual([])
})
