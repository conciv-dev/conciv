import {afterEach, expect, inject, test} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import {HostApiProvider} from '@conciv/extension'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {SessionSnapshot} from '@conciv/session-observer/types'
import {PresencePillView, TerminalPresencePill} from '../src/client/presence-pill.js'

const NOW = 1_700_000_000_000

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mount(element: () => ReturnType<typeof PresencePillView>): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(element, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return host
}

function snapshot(over: Partial<SessionSnapshot>): SessionSnapshot {
  return {
    state: 'connected',
    evidence: 'hook',
    lastEvidenceAt: 1000,
    lastEvidenceWallAt: NOW,
    health: {ok: true},
    ...over,
  }
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
  const host = mount(() => (
    <HostApiProvider apiBase={() => base} sessionId={() => sessionId} slot="status">
      <TerminalPresencePill />
    </HostApiProvider>
  ))
  expect(host.textContent).toBe('')

  await hook(base, sessionId, 'UserPromptSubmit')
  await expect.element(page.getByText(/Terminal working/)).toBeVisible()

  await hook(base, sessionId, 'Stop')
  await expect.element(page.getByText(/Terminal connected/)).toBeVisible()

  await hook(base, sessionId, 'SessionEnd')
  await expect.element(page.getByText(/Terminal connected/)).not.toBeInTheDocument()
  expect(host.textContent).toBe('')
})

test('keeps its slot reserved while the terminal is idle so nothing pops in later', () => {
  const host = mount(() => <PresencePillView snapshot={snapshot({state: 'idle'})} now={NOW} />)
  expect(host.textContent).toBe('')
  expect(host.firstElementChild?.getAttribute('aria-live')).toBe('polite')
})

test('warns that a long task may still be running and says when it last reported', async () => {
  mount(() => (
    <PresencePillView snapshot={snapshot({state: 'stale', lastEvidenceWallAt: NOW - 7 * 60_000})} now={NOW} />
  ))
  await expect.element(page.getByText(/Terminal may still be busy/)).toBeVisible()
  await expect.element(page.getByText(/7 minutes ago/)).toBeVisible()
})

test('says the transcript is unreadable instead of showing a healthy terminal', async () => {
  mount(() => (
    <PresencePillView
      snapshot={snapshot({state: 'connected', health: {ok: false, reason: 'unreadable', detail: 'EACCES', since: 1}})}
      now={NOW}
    />
  ))
  await expect.element(page.getByText('Can’t read the terminal transcript')).toBeVisible()
})
