import {describe, expect, it, test} from 'vitest'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('opening and closing the panel', () => {
  test('the user opens the panel from the launcher and closes it every way the shell offers', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await mount({engine})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))
    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    await user.click(await screen.findByRole('button', {name: 'Minimize conciv chat'}))
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()

    await user.keyboard('{Control>}.{/Control}')
    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    await user.keyboard('{Control>}.{/Control}')
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    expect(await screen.findByRole('dialog', {name: 'Session options'})).toBeVisible()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'Session options'})).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
    await user.click(await screen.findByRole('button', {name: 'Close chat'}))
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'conciv chat agent'})).not.toBeInTheDocument()
  })
})

describe('where the app opens', () => {
  it.each(['/?open=true', '/panel/latest?open=true'])('the address %s opens the newest session', async (address) => {
    const engine = await createEngine()
    await engine.newSession('Plan the release')
    await mount({engine, history: createEngineRouterHistory({initialEntries: [address]})})

    expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Plan the release, session options'})).toBeVisible()
  })
})
