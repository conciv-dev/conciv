import {afterEach, expect, inject, test} from 'vitest'
import {render} from 'solid-js/web'
import {HostApiProvider} from '@conciv/extension'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {TerminalPresencePill} from '../src/client/presence-pill.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mountPill(base: string, sessionId: string): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(
    () => (
      <HostApiProvider apiBase={base} sessionId={() => sessionId} slot="status">
        <TerminalPresencePill />
      </HostApiProvider>
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return host
}

async function hook(base: string, sessionId: string, event: string): Promise<void> {
  await fetch(`${base}/api/ext/terminal/hook`, {
    method: 'POST',
    headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: sessionId},
    body: JSON.stringify({session_id: 'harness-token', hook_event_name: event}),
  })
}

test('shows nothing until claude reports in, then tracks the terminal state', async () => {
  const base = inject('terminalBase')
  const sessionId = `conciv_pill_${Date.now()}`
  const host = mountPill(base, sessionId)
  await expect.poll(() => host.textContent).toBe('')

  await hook(base, sessionId, 'UserPromptSubmit')
  await expect.poll(() => host.textContent).toContain('Terminal working')

  await hook(base, sessionId, 'Stop')
  await expect.poll(() => host.textContent).toContain('Terminal connected')

  await hook(base, sessionId, 'SessionEnd')
  await expect.poll(() => host.textContent).toBe('')
})
