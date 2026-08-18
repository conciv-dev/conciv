import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {createSignal} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {SessionStatus} from '@conciv/ui-kit-chat'
import {StatusBar} from '../src/pane/status-bar.jsx'

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
})
