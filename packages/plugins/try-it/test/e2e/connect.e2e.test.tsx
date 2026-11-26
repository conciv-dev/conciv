import {describe, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import tryIt from '../../src/plugin-experimental.js'

describe('connecting the widget to a local engine', () => {
  test('with no engine starting, the cover shows the three steps, copies the connect command and the agent prompt, and points to the quickstart once the slow wait has passed', async () => {
    const user = userEvent.setup({delay: null})
    const token = crypto.randomUUID()
    await renderTestApp({
      engine: 'none',
      plugins: [{id: '@conciv/plugin-try-it', plugin: tryIt, options: {token, probeMs: 50, slowMs: 200}}],
    })

    expect(await screen.findByRole('heading', {name: 'Drive this page with your agent.'})).toBeVisible()
    expect(screen.queryByRole('link', {name: 'quickstart'})).not.toBeInTheDocument()
    expect(screen.getByText('Copy the connect command')).toBeVisible()
    expect(screen.getByText('Run it in your terminal')).toBeVisible()
    expect(screen.getByText("Approve Chrome's local-network prompt")).toBeVisible()
    expect(screen.getByText('Waiting for your agent…')).toBeVisible()
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

    expect(await screen.findByRole('link', {name: 'quickstart'})).toBeVisible()
    expect(screen.getByText('Waiting for your agent…')).toBeVisible()
    expect(screen.queryByText('Agent connected')).not.toBeInTheDocument()
  })
})
