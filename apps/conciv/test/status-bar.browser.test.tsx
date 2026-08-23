import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {createSignal} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {SessionStatus} from '@conciv/ui-kit-chat'
import {StatusBar} from '../src/pane/status-bar.jsx'
import {viewTabId, viewTabPanelId} from '../src/pane/view-tab-ids.js'

function mountDynamic(): (status: SessionStatus) => void {
  const [status, setStatus] = createSignal<SessionStatus>({kind: 'running', label: 'RUNNING'})
  render(() => (
    <StatusBar
      status={status()}
      elapsedLabel="00:12"
      diff={{files: 2, adds: 5, dels: 1}}
      views={[{id: 'chat', label: 'Chat'}]}
      activeView="chat"
      onSelectView={() => {}}
      disabled={false}
    />
  ))
  return setStatus
}

describe('StatusBar session status derivation', () => {
  it('flips the state chip from RUNNING to DONE as the session settles', async () => {
    const setStatus = mountDynamic()
    await expect.element(page.getByText('RUNNING', {exact: true})).toBeVisible()
    setStatus({kind: 'done', label: 'DONE'})
    await expect.element(page.getByText('DONE', {exact: true})).toBeVisible()
    expect(page.getByText('RUNNING', {exact: true}).elements()).toHaveLength(0)
  })

  function mountViews(activeView: string, onSelectView: (id: string) => void = () => {}, disabled = false) {
    render(() => (
      <StatusBar
        status={{kind: 'done', label: 'DONE'}}
        elapsedLabel="00:12"
        diff={{files: 0, adds: 0, dels: 0}}
        views={[
          {id: 'chat', label: 'Chat'},
          {id: 'board', label: 'Board'},
        ]}
        activeView={activeView}
        onSelectView={onSelectView}
        disabled={disabled}
      />
    ))
  }

  it('exposes the view switcher as a tablist with the active view selected', async () => {
    mountViews('board')

    await expect.element(page.getByRole('tablist')).toBeVisible()
    await expect.element(page.getByRole('tab', {name: 'Board'})).toHaveAttribute('aria-selected', 'true')
    await expect.element(page.getByRole('tab', {name: 'Chat'})).toHaveAttribute('aria-selected', 'false')
  })

  it('names the panel each tab controls with a stable id the view can carry', async () => {
    mountViews('board')

    const board = page.getByRole('tab', {name: 'Board'})
    await expect.element(board).toHaveAttribute('id', viewTabId('board'))
    await expect.element(board).toHaveAttribute('aria-controls', viewTabPanelId('board'))
  })

  it('reports the picked view when another tab is chosen', async () => {
    const picked: string[] = []
    mountViews('chat', (id) => picked.push(id))

    await userEvent.click(page.getByRole('tab', {name: 'Board'}))

    await expect.element(page.getByRole('tab', {name: 'Board'})).toBeVisible()
    expect(picked).toEqual(['board'])
    await page.screenshot({path: '__screenshots__/status-bar/view-tab-indicator.png'})
  })

  it('locks the tabs the leave guard blocks while keeping the active one reachable', async () => {
    mountViews('chat', () => {}, true)

    await expect.element(page.getByRole('tab', {name: 'Board'})).toBeDisabled()
    await expect.element(page.getByRole('tab', {name: 'Chat'})).not.toBeDisabled()
  })

  it('announces the state chip through a polite live region', async () => {
    const setStatus = mountDynamic()
    await expect.element(page.getByRole('status')).toHaveTextContent('RUNNING')
    setStatus({kind: 'failed', label: 'FAILED'})
    await expect.element(page.getByRole('status')).toHaveTextContent('FAILED')
  })
})
