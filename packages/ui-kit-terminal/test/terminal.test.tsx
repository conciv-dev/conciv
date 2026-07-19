import {describe, expect, inject, it} from 'vitest'
import {render} from 'solid-js/web'
import type {JSX} from 'solid-js'
import {until} from '@conciv/harness-testkit/until'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'
import {createTerminalModel, translateBuffer, type TerminalModel} from '../src/model.js'
import {TerminalPrimitive} from '../src/primitives/terminal.js'

function mount(ui: () => JSX.Element): {host: HTMLElement; dispose: () => void} {
  const host = document.createElement('div')
  host.style.width = '640px'
  host.style.height = '320px'
  document.body.appendChild(host)
  const dispose = render(ui, host)
  return {host, dispose}
}

function controlModel(): TerminalModel {
  const base = inject('controlBase')
  return createTerminalModel({url: () => base})
}

async function emit(model: TerminalModel, frame: TtyServerControl): Promise<void> {
  await until(() => model.status() === 'open')
  model.sendInput(JSON.stringify({emit: frame}))
}

describe('terminal primitives', () => {
  it('mounts xterm and renders written bytes', async () => {
    const model = createTerminalModel({url: () => 'ws://127.0.0.1:1/never'})
    const {dispose} = mount(() => (
      <TerminalPrimitive.Root model={model}>
        <TerminalPrimitive.Screen />
      </TerminalPrimitive.Root>
    ))
    await until(() => model.terminal.element != null)
    model.terminal.write('\u001b[31mhello-term\u001b[0m')
    await until(() => translateBuffer(model.terminal).includes('hello-term'))
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
      <TerminalPrimitive.Root model={model}>
        <TerminalPrimitive.Screen />
      </TerminalPrimitive.Root>
    ))
    await until(() => model.terminal.element != null)
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
    await until(() => model.terminal.element != null)
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
    await until(() => model.terminal.element != null)
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
    expect(shadow.querySelector('style[data-conciv-xterm]')).toBeNull()
    document.body.appendChild(host)
    await until(() => shadow.querySelector('style[data-conciv-xterm]') !== null)
    dispose()
    host.remove()
  })

  it('shows the banner only after exit', async () => {
    const model = controlModel()
    const {host, dispose} = mount(() => (
      <TerminalPrimitive.Root model={model}>
        <TerminalPrimitive.Screen />
        <TerminalPrimitive.Banner>{(state) => <p>ended with {state.code}</p>}</TerminalPrimitive.Banner>
      </TerminalPrimitive.Root>
    ))
    await until(() => model.terminal.element != null)
    expect(host.textContent ?? '').not.toContain('ended with')
    await emit(model, {type: 'exit', code: 0})
    await until(() => (host.textContent ?? '').includes('ended with 0'))
    dispose()
  })

  it('surfaces error frames as error status', async () => {
    const model = controlModel()
    const {host, dispose} = mount(() => (
      <TerminalPrimitive.Root model={model}>
        <TerminalPrimitive.Screen />
        <TerminalPrimitive.Banner>{(state) => <p>failed: {state.message}</p>}</TerminalPrimitive.Banner>
      </TerminalPrimitive.Root>
    ))
    await until(() => model.terminal.element != null)
    await emit(model, {type: 'error', message: 'spawn failed'})
    await until(() => (host.textContent ?? '').includes('failed: spawn failed'))
    expect(model.status()).toBe('error')
    dispose()
  })

  it('tracks busy frames', async () => {
    const model = controlModel()
    expect(model.busy()).toBe(false)
    model.connect()
    await emit(model, {type: 'busy', busy: true})
    await until(() => model.busy())
    await emit(model, {type: 'busy', busy: false})
    await until(() => !model.busy())
    model.disconnect()
  })
})
