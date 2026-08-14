import {describe, expect, inject, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {createSignal, type Accessor, type JSX} from 'solid-js'
import {getExtensionApi, MountedExtension} from '@conciv/extension'
import {HostApiProvider} from '@conciv/extension/host'
import {ConnectPane} from '../src/client/connect-pane.js'
import {tryIt} from '../src/client.js'

const ORIGIN = 'https://conciv.test'

const tryItApi = getExtensionApi('try-it')

function CrossEntryPaneOwner(props: {token: string}): JSX.Element {
  const connect = tryItApi.useConnect()
  return <ConnectPane token={props.token} connect={connect} />
}

function mount(ui: () => JSX.Element): () => void {
  return render(ui).unmount
}

function mountPane(token: string, label: string): {dispose: () => void; handOff: Accessor<string>} {
  const [handOff, setHandOff] = createSignal('')
  const dispose = mount(() => (
    <HostApiProvider connect={{origin: ORIGIN, found: setHandOff}}>
      <CrossEntryPaneOwner token={token} />
      <section aria-label={label}>{handOff()}</section>
    </HostApiProvider>
  ))
  return {dispose, handOff}
}

function mountShippedClient(token: string, label: string): {dispose: () => void; handOff: Accessor<string>} {
  const [handOff, setHandOff] = createSignal('')
  const dispose = mount(() => (
    <HostApiProvider connect={{origin: ORIGIN, found: setHandOff}}>
      <MountedExtension extension={tryIt({token})} clientValue={{}} slot="connect" />
      <section aria-label={label}>{handOff()}</section>
    </HostApiProvider>
  ))
  return {dispose, handOff}
}

function handOffLog(label: string) {
  return page.getByRole('region', {name: label})
}

function waitingLine() {
  return page.getByText('Waiting for your agent', {exact: false})
}

async function startCore(token: string): Promise<void> {
  await fetch(`${inject('armBase')}/arm/${token}`, {method: 'POST'})
}

async function probeCount(token: string): Promise<number> {
  const response = await fetch(`${inject('armBase')}/probes/${token}`)
  const body: unknown = await response.json()
  return typeof body === 'object' && body !== null && 'probes' in body && typeof body.probes === 'number'
    ? body.probes
    : -1
}

function idleFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const LEAK_WINDOW_MS = 3_000

describe('connect pane', () => {
  it('resolves host wiring across entries: HostApiProvider from @conciv/extension/host, getExtensionApi from @conciv/extension', async () => {
    const pane = mountPane('cross-entry', 'cross entry handoff')
    try {
      await expect.element(waitingLine()).toBeVisible()
      await startCore('cross-entry')
      await expect.element(handOffLog('cross entry handoff')).toHaveTextContent('/t/cross-entry')
    } finally {
      pane.dispose()
    }
  })

  it('hands the core over from the shipped client, whose probe callback fires without a Solid owner', async () => {
    const pane = mountShippedClient('shipped', 'shipped handoff')
    try {
      await expect.element(waitingLine()).toBeVisible()
      await startCore('shipped')
      await expect.element(handOffLog('shipped handoff')).toHaveTextContent('/t/shipped')
    } finally {
      pane.dispose()
    }
  })

  it('hands the core over once one answers on a connect port', async () => {
    const pane = mountPane('appears', 'appears handoff')
    try {
      await expect.element(waitingLine()).toBeVisible()
      await startCore('appears')
      await expect.element(page.getByText('Agent connected')).toBeVisible()
      await expect.element(handOffLog('appears handoff')).toHaveTextContent('/t/appears')
    } finally {
      pane.dispose()
    }
  })

  it('stops probing once the pane is unmounted', async () => {
    const abandoned = mountPane('unmounted', 'abandoned handoff')
    await expect.element(waitingLine()).toBeVisible()
    abandoned.dispose()
    await startCore('unmounted')

    const sealed = await probeCount('unmounted')
    await idleFor(LEAK_WINDOW_MS)

    expect(await probeCount('unmounted')).toBe(sealed)
    expect(abandoned.handOff()).toBe('')
  })
})
