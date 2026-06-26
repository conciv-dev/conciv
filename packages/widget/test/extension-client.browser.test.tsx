import {describe, it, expect, afterEach, beforeEach} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import {ChatPanel} from '../src/chat/chat-panel.js'
import {defineClient} from '@mandarax/api-client'
import {sampleExtension, sampleClientProbe} from './fixtures/sample-extension.js'
import {buildInstances} from './helpers/instances.js'
import type {ExtensionInstance} from '../src/extension/extension-slots.js'

// The mount-time .client() lifecycle in a real browser: mountWidget installs the one ClientApi and runs
// each extension's .client() ONCE (widget lifetime, not per panel), merging its value into useContext
// and returning a dispose. The fixture's .client records opens / closes / live + the apiBase it read off
// useClientApi(), so the real lifecycle is observed directly (no mocks). active={false} keeps chat from
// hydrating.
const API_BASE = 'http://probe.example'
const disposers: (() => void)[] = []

function mountPanel(instances: ExtensionInstance[]): () => void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(
    () => (
      <ChatPanel
        apiBase={API_BASE}
        harnessId="claude"
        client={defineClient({apiBase: API_BASE})}
        active={false}
        instances={instances}
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

describe('extension .client() lifecycle (real browser)', () => {
  it('runs .client once at mount and reads the apiBase off useClientApi()', async () => {
    mountPanel(buildInstances([sampleExtension], API_BASE))
    // The value merged into useContext renders ("ready") — proves the client factory ran + merged.
    await expect.element(page.getByText('sample status ready')).toBeVisible()
    expect(sampleClientProbe.opens).toBe(1)
    expect(sampleClientProbe.live).toBe(1)
    expect(sampleClientProbe.apiBase).toBe(API_BASE)
  })

  it('runs the returned dispose to tear the client down (no leak)', async () => {
    const instances = buildInstances([sampleExtension], API_BASE)
    mountPanel(instances)
    await expect.element(page.getByText('sample status ready')).toBeVisible()
    expect(sampleClientProbe.live).toBe(1)
    for (const instance of instances) instance.dispose?.()
    expect(sampleClientProbe.closes).toBe(1)
    expect(sampleClientProbe.live).toBe(0)
  })

  it('shares ONE client across concurrent panels (mount-lifetime, not per-panel)', async () => {
    const instances = buildInstances([sampleExtension], API_BASE)
    mountPanel(instances)
    mountPanel(instances)
    await expect.element(page.getByText('sample status ready').nth(1)).toBeVisible()
    expect(sampleClientProbe.opens).toBe(1)
    expect(sampleClientProbe.live).toBe(1)
    for (const instance of instances) instance.dispose?.()
    expect(sampleClientProbe.closes).toBe(1)
    expect(sampleClientProbe.live).toBe(0)
  })
})
