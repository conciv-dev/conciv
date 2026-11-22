import {describe, expect, it, test} from 'vitest'
import {userEvent as browserInput} from 'vitest/browser'
import {render, screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('the general settings change the panel', () => {
  test('the user picks a colour mode, a skin, hides the launcher and brings it back, and closes the panel with a page click', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
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

  it.each(['neon', 'toString', 'constructor'])(
    'a page skin %s that conciv does not ship is not taken, and the Skin row keeps the user choice',
    async (skin) => {
      const user = userEvent.setup()
      render(() => <style>{`body { --conciv-skin: ${skin}; }`}</style>)
      const engine = await createEngine()
      await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})
      await user.click(await screen.findByRole('link', {name: 'Settings'}))

      expect(await screen.findByRole('radio', {name: 'Conciv'})).toBeChecked()
      expect(screen.queryByText('Set by the page in --conciv-skin')).not.toBeInTheDocument()
    },
  )
})
