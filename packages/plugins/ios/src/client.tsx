import {Show, type JSX} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {Effect, Queue, Scope, Stream, SubscriptionRef} from 'effect'
import {Plugin, Slot} from '@conciv/plugin/experimental'
import {createEventBusClient, PANEL_PLUGIN_ID, type PanelCommandEventMap} from '@conciv/protocol/event-bus'
import type {ElementRect, GrabActions, GrabProvider} from '@conciv/grab'
import type {GrabMode} from './bridge.js'
import {makeNativeClient, type NativeClient, type NativeTransport} from './bridge-client.js'
import {readIncompatible, type NativeSignal} from './bridge-machine.js'
import {nativePageBase} from './page-base.js'

export {nativePageBase} from './page-base.js'

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

const [bridgeState, setBridgeState] = createStore<{
  incompatible: Incompatible | null
  grabbable: boolean
}>({
  incompatible: null,
  grabbable: false,
})

let bridge: NativeClient | null = null

function dispatch(name: string, detail?: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent(name, {detail}))
}

const panelCommands = createEventBusClient<PanelCommandEventMap>({
  pluginId: PANEL_PLUGIN_ID,
  reconnectEveryMs: 500,
  maxRetries: 60,
})

function makeWebkitTransport(): NativeTransport {
  const calls = Effect.runSync(Queue.unbounded<unknown>())
  const forward =
    (type: string): NativeCall =>
    (message) =>
      void Queue.offerUnsafe(calls, {...message, type})
  window.__concivNative = {
    handshake: forward('handshake'),
    bridgeIncompatible: forward('bridge.incompatible'),
    open: forward('open'),
    close: forward('close'),
    grabResult: forward('grabResult'),
    grabCapability: forward('grabCapability'),
  }
  return {
    calls: Stream.fromQueue(calls),
    post: (message) => Effect.sync(() => window.webkit?.messageHandlers?.concivBridge?.postMessage(message)),
  }
}

function followSignal(signal: NativeSignal): void {
  if (signal.type === 'open') return panelCommands.emit('open', undefined)
  if (signal.type === 'close') return panelCommands.emit('close', undefined)
  dispatch('conciv:rebind', {apiBase: signal.apiBase})
}

function onPanelToggled(event: WindowEventMap['conciv:panel-toggled']): void {
  if (!bridge) return
  const detail = event.detail
  if (!detail) return
  Effect.runFork(
    bridge.panelToggled({
      open: detail.open === true,
      connected: detail.connected === true,
      mascotRect: detail.mascotRect ?? null,
    }),
  )
}

function nativeHandlerPresent(): boolean {
  return typeof window !== 'undefined' && window.webkit?.messageHandlers?.concivBridge !== undefined
}

function ensureBridge(): NativeClient | null {
  if (bridge) return bridge
  if (!nativeHandlerPresent()) return null
  const scope = Effect.runSync(Scope.make())
  const client = Effect.runSync(
    makeNativeClient({
      transport: makeWebkitTransport(),
      clientId: `native-${crypto.randomUUID()}`,
      apiBase: nativePageBase(window.location),
    }).pipe(Scope.provide(scope)),
  )
  bridge = client
  Effect.runFork(
    Stream.runForEach(SubscriptionRef.changes(client.state), (state) =>
      Effect.sync(() =>
        setBridgeState(
          reconcile({
            incompatible: readIncompatible(state),
            grabbable: state.grabbable,
          }),
        ),
      ),
    ),
  )
  Effect.runFork(Stream.runForEach(client.signals, (signal) => Effect.sync(() => followSignal(signal))))
  window.addEventListener('conciv:panel-toggled', onPanelToggled)
  return client
}

function picking(engine: NativeClient): boolean {
  return Effect.runSync(SubscriptionRef.get(engine.state)).pick.status === 'picking'
}

export function makeNativeGrabProvider(): GrabProvider {
  const engine = ensureBridge()
  const doPick = async (mode: GrabMode) => {
    if (!engine) return null
    panelCommands.emit('close', undefined)
    try {
      return await Effect.runPromise(engine.pick(mode))
    } finally {
      if (!picking(engine)) panelCommands.emit('open', undefined)
    }
  }
  const actions: GrabActions = {
    pick: () => doPick('activate'),
    comment: () => doPick('comment'),
    cancel: () => {
      if (engine) Effect.runFork(engine.cancel)
    },
    isActive: () => engine !== null && picking(engine),
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
