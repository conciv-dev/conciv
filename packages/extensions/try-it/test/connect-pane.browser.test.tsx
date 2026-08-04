import {describe, expect, inject, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal, type Accessor, type JSX} from 'solid-js'
import {HostApiProvider} from '@conciv/extension'
import {ConnectPane} from '../src/client/connect-pane.js'

const ORIGIN = 'https://conciv.test'

function mount(ui: () => JSX.Element): () => void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const disposeRoot = render(ui, host)
  return () => {
    disposeRoot()
    host.remove()
  }
}

function mountPane(token: string, label: string): {dispose: () => void; handOff: Accessor<string>} {
  const [handOff, setHandOff] = createSignal('')
  const dispose = mount(() => (
    <HostApiProvider connect={{origin: ORIGIN, found: setHandOff}}>
      <ConnectPane token={token} />
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
  it('hands the core over once one answers on a connect port', async () => {
    const pane = mountPane('appears', 'appears handoff')
    await expect.element(waitingLine()).toBeVisible()
    await startCore('appears')
    await expect.element(page.getByText('Agent connected')).toBeVisible()
    await expect.element(handOffLog('appears handoff')).toHaveTextContent('/t/appears')
    pane.dispose()
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
