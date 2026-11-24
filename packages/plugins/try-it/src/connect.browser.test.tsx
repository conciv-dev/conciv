import {describe, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {mount} from '@conciv/plugin-testkit/browser'
import tryIt from './plugin-experimental.js'

describe('connecting the widget to a local engine', () => {
  test('a visitor sees the three connect steps, copies the command and the agent prompt, and the copy step is done', async () => {
    const user = userEvent.setup({delay: null})
    const token = crypto.randomUUID()
    await mount(tryIt, {id: '@conciv/plugin-try-it', options: {token, probeMs: 100, holdMs: 1_000}})

    expect(await screen.findByRole('heading', {name: 'Drive this page with your agent.'})).toBeVisible()
    expect(screen.getByText('Copy the connect command')).toBeVisible()
    expect(screen.getByText('Run it in your terminal')).toBeVisible()
    expect(screen.getByText("Approve Chrome's local-network prompt")).toBeVisible()
    expect(screen.getByText('Waiting for your agent…')).toBeVisible()
    expect(screen.queryByRole('link', {name: 'quickstart'})).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('1')).toBeVisible()
    expect(screen.getByText('2')).toBeVisible()
    expect(screen.getByText('3')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Copy connect command'}))
    expect(await navigator.clipboard.readText()).toBe(`npx @conciv/try --token ${token}`)
    await expect.element(page.getByText('1', {exact: true})).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'or hand it to your coding agent'}))
    await user.click(await screen.findByRole('button', {name: 'Copy agent prompt'}))
    expect(await navigator.clipboard.readText()).toContain(
      `Run \`npx @conciv/try --token ${token}\` and keep it running`,
    )
  })

  test('with no engine starting, the cover points to the quickstart once the slow wait has passed', async () => {
    const token = crypto.randomUUID()
    await mount(tryIt, {id: '@conciv/plugin-try-it', options: {token, probeMs: 50, slowMs: 200}})

    expect(await screen.findByRole('heading', {name: 'Drive this page with your agent.'})).toBeVisible()
    expect(await screen.findByRole('link', {name: 'quickstart'})).toBeVisible()
    expect(screen.getByText('Waiting for your agent…')).toBeVisible()
    expect(screen.queryByText('Agent connected')).not.toBeInTheDocument()
  })
})
