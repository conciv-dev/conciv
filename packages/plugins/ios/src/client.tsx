import {Show, type JSX} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {Effect, FiberSet, Queue, Stream, SubscriptionRef} from 'effect'
import {Plugin, Slot} from '@conciv/frontend-plugin-api'
import {
  createEventBusClient,
  PANEL_PLUGIN_ID,
  type EventBusClient,
  type PanelCommandEventMap,
} from '@conciv/types/event-bus'
import type {ElementRect, GrabActions, GrabProvider} from '@conciv/grab'
import type {GrabMode} from './rpc.js'
import {IosBridge} from './bridge.js'
import {IosBridgeMachine} from './bridge-machine.js'

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

type NativeHandler = {postMessage: (message: unknown) => void}

declare global {
  interface Window {
    webkit?: {messageHandlers?: {concivBridge?: NativeHandler}}
    __concivNative?: NativeApi
  }
  interface WindowEventMap {
    'conciv:panel-toggled': CustomEvent<PanelToggledDetail>
  }
}

type Incompatible = {nativeMinV: number; nativeMaxV: number}

type BridgeView = {incompatible: Incompatible | null; grabbable: boolean; picking: boolean}

type NativeService = {
  readonly grabProvider: GrabProvider
  readonly setup: Plugin.Setup
}

type PanelCommands = EventBusClient<PanelCommandEventMap>

const installTransport = Effect.acquireRelease(
  Effect.gen(function* () {
    const calls = yield* Queue.unbounded<unknown>()
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
    const transport: IosBridge.NativeTransport = {
      calls: Stream.fromQueue(calls),
      post: (message) => Effect.sync(() => window.webkit?.messageHandlers?.concivBridge?.postMessage(message)),
    }
    return transport
  }),
  () => Effect.sync(() => Reflect.deleteProperty(window, '__concivNative')),
)

const openPanelCommands = Effect.acquireRelease(
  Effect.sync(() =>
    createEventBusClient<PanelCommandEventMap>({
      pluginId: PANEL_PLUGIN_ID,
      target: () => window,
      reconnectEveryMs: 500,
      maxRetries: 60,
    }),
  ),
  (commands) => Effect.sync(() => commands.dispose()),
)

const listenPanelToggled = (listener: (event: WindowEventMap['conciv:panel-toggled']) => void) =>
  Effect.acquireRelease(
    Effect.sync(() => window.addEventListener('conciv:panel-toggled', listener)),
    () => Effect.sync(() => window.removeEventListener('conciv:panel-toggled', listener)),
  )

function followSignal(commands: PanelCommands, signal: IosBridgeMachine.NativeSignal): void {
  if (signal.type === 'open') return commands.emit('open', undefined)
  if (signal.type === 'close') return commands.emit('close', undefined)
  window.dispatchEvent(new CustomEvent('conciv:rebind', {detail: {apiBase: signal.apiBase}}))
}

function IncompatibleBridgeAlert(props: {view: BridgeView}): JSX.Element {
  return (
    <Show when={props.view.incompatible}>
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

const startNativeService = Effect.fn('ios.native.start')(function* () {
  const commands = yield* openPanelCommands
  const transport = yield* installTransport
  const client = yield* IosBridge.makeNativeClient({
    transport,
    clientId: `native-${crypto.randomUUID()}`,
    apiBase: window.location.origin,
  })
  const run = yield* FiberSet.makeRuntime<never, unknown, unknown>()
  const runPromise = yield* FiberSet.makeRuntimePromise<never, unknown, unknown>()
  const [view, setView] = createStore<BridgeView>({incompatible: null, grabbable: false, picking: false})

  const followers = yield* FiberSet.make<void, never>()
  yield* FiberSet.run(
    followers,
    Stream.runForEach(SubscriptionRef.changes(client.state), (state) =>
      Effect.sync(() =>
        setView(
          reconcile({
            incompatible: IosBridgeMachine.readIncompatible(state),
            grabbable: state.grabbable,
            picking: state.pick.status === 'picking',
          }),
        ),
      ),
    ),
  )
  yield* FiberSet.run(
    followers,
    Stream.runForEach(client.signals, (signal) => Effect.sync(() => followSignal(commands, signal))),
  )
  yield* listenPanelToggled((event) => {
    const detail = event.detail
    if (!detail) return
    run(
      client.panelToggled({
        open: detail.open === true,
        connected: detail.connected === true,
        mascotRect: detail.mascotRect ?? null,
      }),
    )
  })

  const reopenUnlessPicking = SubscriptionRef.get(client.state).pipe(
    Effect.flatMap((state) =>
      state.pick.status === 'picking' ? Effect.void : Effect.sync(() => commands.emit('open', undefined)),
    ),
  )
  const pickWith = (mode: GrabMode) =>
    runPromise(
      Effect.sync(() => commands.emit('close', undefined)).pipe(
        Effect.andThen(client.pick(mode)),
        Effect.ensuring(reopenUnlessPicking),
      ),
    )
  const actions: GrabActions = {
    pick: () => pickWith('activate'),
    comment: () => pickWith('comment'),
    cancel: () => void run(client.cancel),
    isActive: () => view.picking,
    grabbable: () => view.grabbable,
  }
  const service: NativeService = {
    grabProvider: () => actions,
    setup: (ctx) => {
      ctx.add(Slot, {at: 'page.overlay', hides: false, render: () => <IncompatibleBridgeAlert view={view} />})
    },
  }
  return service
})

export const makeNativeService = Effect.suspend(() => {
  if (window.webkit?.messageHandlers?.concivBridge === undefined) return Effect.succeed(undefined)
  return startNativeService()
})
