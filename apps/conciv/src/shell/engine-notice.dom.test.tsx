import {describe, expect, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

const STALE =
  'Engine is running outdated code: the server code on disk is newer than the running engine. Restart the dev server.'

describe('the engine asks for a restart or an update', () => {
  test('an engine running code older than the disk asks the user to restart the dev server', async () => {
    const engine = await createEngine()
    await engine.stale({
      stale: true,
      changed: ['src/app.ts'],
      tracked: ['src/app.ts'],
      bootedAt: 0,
      fingerprint: 'disk-1',
    })
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    expect(await screen.findByText(STALE)).toBeVisible()
    expect(screen.queryByText(/but the conciv engine is older/)).not.toBeInTheDocument()
  })

  test('an engine older than the widget asks the user to update the conciv packages', async () => {
    const engine = await createEngine()
    await engine.version('0.0.1')
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    expect(await screen.findByText(/but the conciv engine is older\. Update your @conciv packages/)).toBeVisible()
    expect(screen.queryByText(STALE)).not.toBeInTheDocument()
  })
})

describe('logging in', () => {
  test('a browser with no token logs in with the code the dev server prints, and is told when the engine revokes it', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({
      engine,
      login: 'none',
      history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']}),
    })

    await user.click(await screen.findByRole('button', {name: 'Unauthorized. Authorize conciv'}))
    const dialog = await screen.findByRole('dialog', {name: 'Authorize conciv'})
    expect(dialog).toBeVisible()

    await user.click(within(dialog).getByRole('textbox', {name: 'Digit 1 of 6'}))
    await user.keyboard('000000')
    expect(await within(dialog).findByText("That code didn't match. Check your terminal and try again.")).toBeVisible()

    await user.click(within(dialog).getByRole('button', {name: 'Send a new code'}))
    expect(await within(dialog).findByText('A new code was printed in your terminal.')).toBeVisible()
    const code = await engine.loginCode()
    await user.click(within(dialog).getByRole('textbox', {name: 'Digit 1 of 6'}))
    await user.keyboard(code)

    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'Authorize conciv'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    await engine.revokeBrowsers()
    expect(await screen.findByText('This browser is no longer authorized to use conciv.')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Log in'})).toBeVisible()
  })
})
