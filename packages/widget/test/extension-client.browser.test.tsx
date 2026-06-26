import {describe, it, expect, afterEach, beforeEach} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import {ChatPanel} from '../src/chat/chat-panel.js'
import {defineClient} from '@mandarax/api-client'
import {sampleExtension, sampleClientProbe} from './fixtures/sample-extension.js'

// Gap C in a real browser: the panel runs each extension's .client(ClientApi) once, merges its value
// into useContext, and runs the returned dispose on unmount. The fixture's .client records opens /
// closes / live count + the apiBase it received, so the real Solid mount/unmount lifecycle is observed
// directly (no mocks). active={false} keeps chat from hydrating.
const API_BASE = 'http://probe.example'
const disposers: (() => void)[] = []

function mountPanel(): () => void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(
    () => (
      <ChatPanel
        apiBase={API_BASE}
        harnessId="claude"
        client={defineClient({apiBase: API_BASE})}
        active={false}
        extensions={[sampleExtension]}
      />
    ),
    host,
  )
  disposers.push(dispose)
  return dispose
}

beforeEach(() => {
  sampleClientProbe.opens = 0
  sampleClientProbe.closes = 0
  sampleClientProbe.live = 0
  sampleClientProbe.apiBase = ''
})

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

describe('extension .client(ClientApi) lifecycle (real browser)', () => {
  it('runs .client once per panel and hands it the panel apiBase', async () => {
    mountPanel()
    // The value merged into useContext renders ("ready") — proves the client factory ran + merged.
    await expect.element(page.getByText('sample status ready')).toBeVisible()
    expect(sampleClientProbe.opens).toBe(1)
    expect(sampleClientProbe.live).toBe(1)
    expect(sampleClientProbe.apiBase).toBe(API_BASE)
  })

  it('runs the returned dispose when the panel unmounts (no leak)', async () => {
    const dispose = mountPanel()
    await expect.element(page.getByText('sample status ready')).toBeVisible()
    expect(sampleClientProbe.live).toBe(1)
    dispose()
    expect(sampleClientProbe.closes).toBe(1)
    expect(sampleClientProbe.live).toBe(0)
  })

  it('keeps one independent client per concurrent panel and disposes each on its own unmount', async () => {
    const disposeA = mountPanel()
    const disposeB = mountPanel()
    await expect.element(page.getByText('sample status ready').nth(1)).toBeVisible()
    expect(sampleClientProbe.opens).toBe(2)
    expect(sampleClientProbe.live).toBe(2)
    disposeA()
    expect(sampleClientProbe.live).toBe(1)
    disposeB()
    expect(sampleClientProbe.live).toBe(0)
    expect(sampleClientProbe.closes).toBe(2)
  })
})
