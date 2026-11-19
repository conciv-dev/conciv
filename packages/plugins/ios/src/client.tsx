import {Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Plugin, Slot} from '@conciv/plugin/experimental'
import {createEventBusClient, PANEL_PLUGIN_ID, type PanelCommandEventMap} from '@conciv/protocol/event-bus'
import type {ElementRect, GrabActions, GrabProvider} from '@conciv/grab'
import type {GrabMode} from './bridge.js'
import {createBridgeClient, type BridgeClient, type BridgeTransport} from './native/bridge-client.js'
import {nativePageBase} from './native/page-base.js'

export {nativePageBase} from './native/page-base.js'

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

const [bridgeState, setBridgeState] = createStore<{incompatible: Incompatible | null; grabbable: boolean}>({
  incompatible: null,
  grabbable: false,
})

let bridge: BridgeClient | null = null

function dispatch(name: string, detail?: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent(name, {detail}))
}

const panelCommands = createEventBusClient<PanelCommandEventMap>({
  pluginId: PANEL_PLUGIN_ID,
  reconnectEveryMs: 500,
  maxRetries: 60,
})

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
    ensureOpen: () => panelCommands.emit('open', undefined),
    ensureClose: () => panelCommands.emit('close', undefined),
    onRebind: (apiBase) => dispatch('conciv:rebind', {apiBase}),
    onIncompatible: (info) => setBridgeState('incompatible', info),
    onGrabbableChanged: (value) => setBridgeState('grabbable', value),
    onLog: (level, message) => console[level]('conciv bridge:', message),
  })
  bridge.start()
  setBridgeState('grabbable', bridge.grabbable())
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
    panelCommands.emit('close', undefined)
    try {
      return await engine.pick(mode)
    } finally {
      if (activeRequest === token) {
        activeRequest = 0
        panelCommands.emit('open', undefined)
      }
    }
  }
  const actions: GrabActions = {
    pick: () => doPick('activate'),
    comment: () => doPick('comment'),
    cancel: () => engine?.cancelActive(),
    isActive: () => activeRequest !== 0,
    grabbable: () => bridgeState.grabbable,
  }
  return () => actions
}

function IncompatibleBridgeAlert(): JSX.Element {
  return (
    <Show when={bridgeState.incompatible}>
      {(info) => (
        <div
          role="alert"
          class="text-chat-sm text-chat-on-accent font-chat px-4 py-3 text-center bg-chat-danger pointer-events-auto inset-x-0 top-0 fixed z-50"
        >
          Update the conciv widget or the app SDK: the native app speaks bridge versions {info().nativeMinV} to{' '}
          {info().nativeMaxV}, which this widget does not support.
        </div>
      )}
    </Show>
  )
}

export const setup: Plugin.Setup = (ctx) => {
  ensureBridge()
  ctx.add(Slot, {at: 'page.overlay', hides: false, render: () => <IncompatibleBridgeAlert />})
}
