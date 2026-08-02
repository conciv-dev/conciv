import {describe, expect, inject, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal, onMount, type JSX} from 'solid-js'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'
import {createTerminalModel, translateBuffer, type TerminalModel} from '../src/model.js'
import {TerminalPrimitive} from '../src/primitives/terminal.js'
import {Terminal} from '../src/styled/terminal.js'

function mount(ui: () => JSX.Element): {host: HTMLElement; dispose: () => void} {
  const host = document.createElement('div')
  host.style.width = '640px'
  host.style.height = '320px'
  document.body.appendChild(host)
  const disposeRoot = render(ui, host)
  const dispose = (): void => {
    disposeRoot()
    host.remove()
  }
  return {host, dispose}
}

function SessionLog(props: {model: TerminalModel; label: string}): JSX.Element {
  const [text, setText] = createSignal('')
  onMount(() => {
    const {terminal} = props.model
    terminal.onWriteParsed(() => setText(translateBuffer(terminal)))
  })
  return <section aria-label={props.label}>{text()}</section>
}

function region(label: string) {
  return page.getByRole('region', {name: label})
}

function ModelState(props: {model: TerminalModel; label: string}): JSX.Element {
  return (
    <section aria-label={props.label}>
      status={props.model.status()} busy={String(props.model.busy())}
    </section>
  )
}

function controlModel(): TerminalModel {
  const base = inject('controlBase')
  return createTerminalModel({url: () => base})
}

function greetedModel(key: string): TerminalModel {
  const base = inject('controlBase')
  return createTerminalModel({url: () => `${base}/?greet=${key}`})
}

function dropConnection(model: TerminalModel): void {
  model.sendInput(JSON.stringify({drop: true}))
}

async function emit(model: TerminalModel, label: string, frame: TtyServerControl): Promise<void> {
  await expect.element(region(label)).toHaveTextContent('status=open')
  model.sendInput(JSON.stringify({emit: frame}))
}

describe('terminal primitives', () => {
  it('mounts xterm and renders written bytes', async () => {
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    const {dispose} = mount(() => (
      <>
        <TerminalPrimitive.Root model={model}>
          <TerminalPrimitive.Screen />
        </TerminalPrimitive.Root>
        <SessionLog model={model} label="written bytes log" />
      </>
    ))
    model.terminal.write('\u001b[31mhello-term\u001b[0m')
    await expect.element(region('written bytes log')).toHaveTextContent('hello-term')
    expect(translateBuffer(model.terminal)).toContain('hello-term')
    dispose()
  })

  it('inject is a safe no-op while disconnected', async () => {
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    expect(() => model.inject('note')).not.toThrow()
    model.disconnect()
  })

  it('paste routes through terminal input', async () => {
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    const received: string[] = []
    model.terminal.onData((data) => received.push(data))
    const {dispose} = mount(() => (
      <>
        <TerminalPrimitive.Root model={model}>
          <TerminalPrimitive.Screen />
        </TerminalPrimitive.Root>
        <ModelState model={model} label="paste state" />
      </>
    ))
    await expect.element(region('paste state')).toHaveTextContent('status=connecting')
    model.paste('grab text')
    expect(received.join('')).toContain('grab text')
    dispose()
  })

  it('rail overlay sits beside the screen, not over it', async () => {
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    const {host, dispose} = mount(() => (
      <TerminalPrimitive.Root model={model}>
        <div style={{display: 'flex', 'flex-direction': 'row', width: '640px', height: '320px'}}>
          <div style={{flex: '1', 'min-width': '0'}}>
            <TerminalPrimitive.Screen />
          </div>
          <TerminalPrimitive.Overlay anchor="rail">
            <p style={{width: '160px'}}>rail content</p>
          </TerminalPrimitive.Overlay>
        </div>
      </TerminalPrimitive.Root>
    ))
    await expect.element(page.getByText('rail content')).toBeVisible()
    const screen = host.querySelector('[data-terminal-screen]')
    const overlay = host.querySelector('[data-terminal-overlay="rail"]')
    if (!screen || !overlay) throw new Error('missing screen or overlay')
    const screenBox = screen.getBoundingClientRect()
    const overlayBox = overlay.getBoundingClientRect()
    expect(host.textContent ?? '').toContain('rail content')
    expect(overlayBox.left).toBeGreaterThanOrEqual(screenBox.right - 1)
    dispose()
  })

  it('top-right overlay pins to the root corner above the screen', async () => {
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    const {host, dispose} = mount(() => (
      <div style={{position: 'relative', width: '640px', height: '320px', display: 'flex'}}>
        <TerminalPrimitive.Root model={model}>
          <TerminalPrimitive.Screen />
          <TerminalPrimitive.Overlay anchor="top-right">
            <button type="button">corner action</button>
          </TerminalPrimitive.Overlay>
        </TerminalPrimitive.Root>
      </div>
    ))
    await expect.element(page.getByRole('button', {name: 'corner action'})).toBeVisible()
    const overlay = host.querySelector('[data-terminal-overlay="top-right"]')
    if (!overlay) throw new Error('missing overlay')
    const hostBox = host.getBoundingClientRect()
    const overlayBox = overlay.getBoundingClientRect()
    expect(host.textContent ?? '').toContain('corner action')
    expect(overlayBox.top - hostBox.top).toBeLessThan(40)
    expect(hostBox.right - overlayBox.right).toBeLessThan(40)
    dispose()
  })

  it('injects xterm css into the shadow root even when mounted detached', async () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({mode: 'open'})
    const container = document.createElement('div')
    container.style.cssText = 'width:640px;height:320px;display:flex'
    shadow.appendChild(container)
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    const dispose = render(
      () => (
        <TerminalPrimitive.Root model={model}>
          <TerminalPrimitive.Screen />
        </TerminalPrimitive.Root>
      ),
      container,
    )
    const state = mount(() => <ModelState model={model} label="detached state" />)
    expect(shadow.querySelector('style[data-conciv-xterm]')).toBeNull()
    document.body.appendChild(host)
    await expect.element(region('detached state')).toHaveTextContent('status=connecting')
    expect(shadow.querySelector('style[data-conciv-xterm]')).not.toBeNull()
    state.dispose()
    dispose()
    host.remove()
  })

  it('shows the banner only after exit', async () => {
    const model = controlModel()
    const {host, dispose} = mount(() => (
      <>
        <TerminalPrimitive.Root model={model}>
          <TerminalPrimitive.Screen />
          <TerminalPrimitive.Banner>{(state) => <p>ended with {state.code}</p>}</TerminalPrimitive.Banner>
        </TerminalPrimitive.Root>
        <ModelState model={model} label="banner state" />
      </>
    ))
    expect(host.textContent ?? '').not.toContain('ended with')
    await emit(model, 'banner state', {type: 'exit', code: 0})
    await expect.element(page.getByText('ended with 0')).toBeVisible()
    dispose()
  })

  it('surfaces error frames as error status', async () => {
    const model = controlModel()
    const {dispose} = mount(() => (
      <>
        <TerminalPrimitive.Root model={model}>
          <TerminalPrimitive.Screen />
          <TerminalPrimitive.Banner>{(state) => <p>failed: {state.message}</p>}</TerminalPrimitive.Banner>
        </TerminalPrimitive.Root>
        <ModelState model={model} label="error state" />
      </>
    ))
    await emit(model, 'error state', {type: 'error', message: 'spawn failed'})
    await expect.element(page.getByText('failed: spawn failed')).toBeVisible()
    expect(model.status()).toBe('error')
    dispose()
  })

  it('tracks busy frames', async () => {
    const model = controlModel()
    const {dispose} = mount(() => <ModelState model={model} label="busy state" />)
    expect(model.busy()).toBe(false)
    model.connect()
    await emit(model, 'busy state', {type: 'busy', busy: true})
    await expect.element(region('busy state')).toHaveTextContent('busy=true')
    await emit(model, 'busy state', {type: 'busy', busy: false})
    await expect.element(region('busy state')).toHaveTextContent('busy=false')
    model.disconnect()
    dispose()
  })
})

describe('terminal reconnection', () => {
  it('reopens the session after the connection drops', async () => {
    const model = greetedModel('dropped')
    const {dispose} = mount(() => (
      <>
        <Terminal model={model} />
        <SessionLog model={model} label="dropped log" />
      </>
    ))
    await expect.element(region('dropped log')).toHaveTextContent('dropped-1')
    dropConnection(model)
    await expect.element(region('dropped log')).toHaveTextContent('dropped-2')
    dispose()
  })

  it('keeps reopening past the per-episode attempt cap when every drop recovers', async () => {
    const model = greetedModel('resilient')
    const {dispose} = mount(() => (
      <>
        <Terminal model={model} />
        <SessionLog model={model} label="resilient log" />
      </>
    ))
    await expect.element(region('resilient log')).toHaveTextContent('resilient-1')
    for (let ordinal = 2; ordinal <= 9; ordinal += 1) {
      dropConnection(model)
      await expect.element(region('resilient log'), {timeout: 3000}).toHaveTextContent(`resilient-${ordinal}`)
    }
    dispose()
  })

  it('never reopens the session after a deliberate disconnect', async () => {
    const abandoned = greetedModel('solo')
    const abandonedMount = mount(() => (
      <>
        <Terminal model={abandoned} />
        <SessionLog model={abandoned} label="abandoned log" />
      </>
    ))
    await expect.element(region('abandoned log')).toHaveTextContent('solo-1')
    abandoned.disconnect()
    abandonedMount.dispose()

    const successor = greetedModel('solo')
    const {dispose} = mount(() => (
      <>
        <Terminal model={successor} />
        <SessionLog model={successor} label="successor log" />
      </>
    ))
    await expect.element(region('successor log')).toHaveTextContent('solo-2')
    dropConnection(successor)
    await expect.element(region('successor log')).toHaveTextContent('solo-3')
    dropConnection(successor)
    await expect.element(region('successor log')).toHaveTextContent('solo-4')
    dispose()
  })
})

describe('terminal rail', () => {
  it('builds the rail overlay exactly once', async () => {
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    const builds = {count: 0}
    const Rail = (): JSX.Element => {
      builds.count += 1
      return <div>rail build {builds.count}</div>
    }
    const {dispose} = mount(() => <Terminal model={model} rail={<Rail />} />)
    await expect.element(page.getByText('rail build 1')).toBeVisible()
    expect(builds.count).toBe(1)
    dispose()
  })
})
