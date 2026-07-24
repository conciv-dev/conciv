import {createSignal, Show, type JSX} from 'solid-js'
import {defineExtension} from '@conciv/extension'
import type {ElementRect, GrabActions, GrabProvider} from '@conciv/grab'
import {createBridgeClient, type BridgeClient, type BridgeTransport} from './shared/bridge-client.js'
import type {GrabMode} from './shared/bridge.js'
import {IOS_NAME} from './shared/name.js'
import {nativePageBase} from './shared/page-base.js'

export {nativePageBase} from './shared/page-base.js'

type NativeCall = (message: Record<string, unknown>) => void

type NativeApi = {
  handshake: NativeCall
  bridgeIncompatible: NativeCall
  open: NativeCall
  close: NativeCall
  grabResult: NativeCall
  grabCapability: NativeCall
}

type PanelToggledDetail = {open?: boolean; connected?: boolean; mascotRect?: ElementRect | null}

declare global {
  interface Window {
    webkit?: {messageHandlers?: {concivBridge?: {postMessage: (message: unknown) => void}}}
    __concivNative?: NativeApi
  }
  interface WindowEventMap {
    'conciv:panel-toggled': CustomEvent<PanelToggledDetail>
  }
}

type Incompatible = {nativeMinV: number; nativeMaxV: number}

const [incompatible, setIncompatible] = createSignal<Incompatible | null>(null)
const [grabbable, setGrabbable] = createSignal(false)

let bridge: BridgeClient | null = null

function dispatch(name: string, detail?: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent(name, {detail}))
}

function makeClientId(): string {
  const random = globalThis.crypto?.randomUUID?.()
  return `native-${random ?? Math.random().toString(36).slice(2)}`
}

function makeWebkitTransport(): BridgeTransport {
  let handler: ((raw: unknown) => void) | null = null
  const forward =
    (type: string): NativeCall =>
    (message) =>
      handler?.({...message, type})
  const native: NativeApi = {
    handshake: forward('handshake'),
    bridgeIncompatible: forward('bridge.incompatible'),
    open: forward('open'),
    close: forward('close'),
    grabResult: forward('grabResult'),
    grabCapability: forward('grabCapability'),
  }
  window.__concivNative = native
  return {
    postToNative: (message) => window.webkit?.messageHandlers?.concivBridge?.postMessage(message),
    onNativeCall: (next) => {
      handler = next
    },
  }
}

function onPanelToggled(event: WindowEventMap['conciv:panel-toggled']): void {
  if (!bridge) return
  const detail = event.detail
  if (!detail) return
  bridge.panelToggled(detail.open === true, detail.connected === true, detail.mascotRect ?? null)
}

function nativeHandlerPresent(): boolean {
  return typeof window !== 'undefined' && window.webkit?.messageHandlers?.concivBridge !== undefined
}

function ensureBridge(): BridgeClient | null {
  if (bridge) return bridge
  if (!nativeHandlerPresent()) return null
  bridge = createBridgeClient({
    transport: makeWebkitTransport(),
    scheduler: {
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (handle) => window.clearInterval(handle),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle),
    },
    clientId: makeClientId(),
    boundApiBase: nativePageBase(window.location),
    ensureOpen: () => dispatch('conciv:open-panel'),
    ensureClose: () => dispatch('conciv:close-panel'),
    onRebind: (apiBase) => dispatch('conciv:rebind', {apiBase}),
    onIncompatible: (info) => setIncompatible(info),
    onGrabbableChanged: (value) => setGrabbable(value),
    onLog: (level, message) => console[level]('conciv bridge:', message),
  })
  bridge.start()
  setGrabbable(bridge.grabbable())
  window.addEventListener('conciv:panel-toggled', onPanelToggled)
  return bridge
}

export function makeNativeGrabProvider(): GrabProvider {
  const engine = ensureBridge()
  let requestSeq = 0
  let activeRequest = 0
  const doPick = async (mode: GrabMode) => {
    if (!engine) return null
    const token = ++requestSeq
    activeRequest = token
    dispatch('conciv:close-panel')
    try {
      return await engine.pick(mode)
    } finally {
      if (activeRequest === token) {
        activeRequest = 0
        dispatch('conciv:open-panel')
      }
    }
  }
  const actions: GrabActions = {
    pick: () => doPick('activate'),
    comment: () => doPick('comment'),
    cancel: () => engine?.cancelActive(),
    isActive: () => activeRequest !== 0,
    grabbable: () => grabbable(),
  }
  return () => actions
}

function IosBridgeSurface(): JSX.Element {
  return (
    <Show when={incompatible()}>
      {(info) => (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            'z-index': '2147483647',
            padding: '12px 16px',
            background: '#7f1d1d',
            color: '#fff',
            'font-family': 'system-ui, sans-serif',
            'font-size': '14px',
            'text-align': 'center',
          }}
        >
          Update the conciv widget or the app SDK: the native app speaks bridge versions {info().nativeMinV} to{' '}
          {info().nativeMaxV}, which this widget does not support.
        </div>
      )}
    </Show>
  )
}

export const ios = defineExtension({
  name: IOS_NAME,
  Surface: IosBridgeSurface,
}).client(() => {
  ensureBridge()
  return {value: {}}
})

export default ios
