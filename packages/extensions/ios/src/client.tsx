import {createSignal, Show, type JSX} from 'solid-js'
import {defineExtension} from '@conciv/extension'
import type {ElementRect, GrabActions, GrabProvider} from '@conciv/grab'
import {createBridgeClient, type BridgeClient, type BridgeTransport} from './shared/bridge-client.js'
import type {GrabMode} from './shared/bridge.js'
import {IOS_NAME} from './shared/name.js'

type NativeCall = (message: Record<string, unknown>) => void

type NativeApi = {
  handshake: NativeCall
  bridgeIncompatible: NativeCall
  open: NativeCall
  close: NativeCall
  grabResult: NativeCall
  grabCapability: NativeCall
}

declare global {
  interface Window {
    webkit?: {messageHandlers?: {concivBridge?: {postMessage: (message: unknown) => void}}}
    __concivNative?: NativeApi
  }
}

type Incompatible = {nativeMinV: number; nativeMaxV: number}

const [incompatible, setIncompatible] = createSignal<Incompatible | null>(null)

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

type PanelToggledDetail = {open?: boolean; connected?: boolean; mascotRect?: ElementRect | null}

function onPanelToggled(event: Event): void {
  if (!bridge) return
  const detail = (event as CustomEvent<PanelToggledDetail>).detail
  if (!detail) return
  bridge.panelToggled(detail.open === true, detail.connected === true, detail.mascotRect ?? null)
}

function ensureBridge(): BridgeClient | null {
  if (bridge) return bridge
  if (typeof window === 'undefined') return null
  bridge = createBridgeClient({
    transport: makeWebkitTransport(),
    scheduler: {
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (handle) => window.clearInterval(handle),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle),
    },
    clientId: makeClientId(),
    boundApiBase: window.location.origin,
    ensureOpen: () => dispatch('conciv:open-panel'),
    ensureClose: () => dispatch('conciv:close-panel'),
    onRebind: (apiBase) => dispatch('conciv:rebind', {apiBase}),
    onIncompatible: (info) => setIncompatible(info),
  })
  bridge.start()
  window.addEventListener('conciv:panel-toggled', onPanelToggled)
  return bridge
}

export function makeNativeGrabProvider(): GrabProvider {
  const engine = ensureBridge()
  let active = false
  const doPick = async (mode: GrabMode) => {
    if (!engine) return null
    active = true
    try {
      return await engine.pick(mode)
    } finally {
      active = false
    }
  }
  const actions: GrabActions = {
    pick: () => doPick('activate'),
    comment: () => doPick('comment'),
    cancel: () => engine?.cancelActive(),
    isActive: () => active,
    grabbable: () => engine?.grabbable() ?? false,
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
