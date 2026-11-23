import {Show, onCleanup, type JSX} from 'solid-js'
import {useQuery} from '@conciv/client'
import {OpaqueNoteCard} from '@internal/plugin'
import {createStore, reconcile} from 'solid-js/store'
import {Context, Effect, FiberSet, Layer, ManagedRuntime, Queue, Stream, SubscriptionRef} from 'effect'
import {
  NoteCard,
  Plugin,
  Slot,
  type MountedSession,
  type NoteCardProps,
  type Ui,
  type Widget,
} from '@conciv/plugin/experimental'
import {GrabPicker} from '@conciv/plugin/experimental/grab'
import type {ElementRect, Grab} from '@conciv/plugin/experimental/grab'
import {IosBridge} from './bridge.js'
import {IosBridgeMachine} from './bridge-machine.js'
import {Definition, GRAB_NOTE_ORIGIN, readGrabId, type GrabId, type GrabMode} from './rpc.js'
import {makeGrabNotePicker, sourceLine} from './grab-note.js'

type NativeCall = (message: Record<string, unknown>) => void

type NativeApi = {
  handshake: NativeCall
  bridgeIncompatible: NativeCall
  open: NativeCall
  close: NativeCall
  grabResult: NativeCall
  grabCapability: NativeCall
}

type PanelToggledDetail = {connected?: boolean; mascotRect?: ElementRect | null}

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

type NativeView = {incompatible: Incompatible | null; grabbable: boolean; picking: boolean}

export type NativeLink = {
  readonly view: NativeView
  readonly pick: (mode: GrabMode) => Promise<Grab | null>
  readonly cancel: () => void
}

const NativeLinkService = Context.Service<NativeLink>('@conciv/plugin-ios/NativeLink')

const SNAPSHOT_LABEL = 'Grabbed view snapshot'
const CARD =
  'text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)] flex flex-col gap-2.5 items-start min-w-0'
const AGENT_TEXT =
  'text-chat-text-2 [font-family:var(--chat-mono)] text-xs whitespace-pre-wrap [word-break:break-all] m-0'
const SOURCE_LINE = 'text-chat-text-2 [word-break:break-all]'
const CARD_SNAPSHOT = 'block w-auto h-auto max-w-full max-h-[40cqh]'
const STAGED_SNAPSHOT = 'block h-14 w-40 object-contain'

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

const listenPanelToggled = (listener: (event: WindowEventMap['conciv:panel-toggled']) => void) =>
  Effect.acquireRelease(
    Effect.sync(() => window.addEventListener('conciv:panel-toggled', listener)),
    () => Effect.sync(() => window.removeEventListener('conciv:panel-toggled', listener)),
  )

function followSignal(widget: Widget, signal: IosBridgeMachine.NativeSignal): void {
  if (signal.type === 'open') return widget.open()
  if (signal.type === 'close') return widget.close()
  window.dispatchEvent(new CustomEvent('conciv:rebind', {detail: {apiBase: signal.apiBase}}))
}

const startNativeLink = Effect.fn('ios.native.start')(function* (widget: Widget) {
  const transport = yield* installTransport
  const client = yield* IosBridge.makeNativeClient({
    transport,
    clientId: `native-${crypto.randomUUID()}`,
    apiBase: window.location.origin,
  })
  const run = yield* FiberSet.makeRuntime<never, unknown, unknown>()
  const runPromise = yield* FiberSet.makeRuntimePromise<never, unknown, unknown>()
  const [view, setView] = createStore<NativeView>({incompatible: null, grabbable: false, picking: false})

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
    Stream.runForEach(client.signals, (signal) => Effect.sync(() => followSignal(widget, signal))),
  )
  yield* listenPanelToggled((event) => {
    const detail = event.detail
    if (!detail) return
    run(
      client.panelToggled({
        open: widget.isOpen(),
        connected: detail.connected === true,
        mascotRect: detail.mascotRect ?? null,
      }),
    )
  })

  const reopenUnlessPicking = SubscriptionRef.get(client.state).pipe(
    Effect.flatMap((state) => (state.pick.status === 'picking' ? Effect.void : Effect.sync(() => widget.open()))),
  )
  const link: NativeLink = {
    view,
    pick: (mode) =>
      runPromise(
        Effect.sync(() => widget.close()).pipe(Effect.andThen(client.pick(mode)), Effect.ensuring(reopenUnlessPicking)),
      ),
    cancel: () => void run(client.cancel),
  }
  return link
})

const UNREADABLE = (
  <span class={AGENT_TEXT} role="status">
    Grabbed view could not be read
  </span>
)

function GrabNoteCard(props: NoteCardProps & {ui: Ui}): JSX.Element {
  return (
    <Show when={props.session} fallback={UNREADABLE}>
      {(session) => (
        <Show when={readGrabId(props.note.href).at(0)} fallback={UNREADABLE}>
          {(id) => (
            <StoredGrabCard session={session()} id={id()} staged={props.note.commentId !== undefined} ui={props.ui} />
          )}
        </Show>
      )}
    </Show>
  )
}

function StoredGrabCard(props: {session: MountedSession; id: GrabId; staged: boolean; ui: Ui}): JSX.Element {
  const grab = useQuery(() => ({
    ...props.session.server.client.rpc(Definition)['grabs.get'].queryOptions({input: {id: props.id}}),
    retry: false,
  }))
  return (
    <Show when={!grab.isPending} fallback={<props.ui.Loader size="small" />}>
      <Show when={grab.data} fallback={UNREADABLE}>
        {(value) => (
          <div class={CARD} data-chat-grab>
            <Show when={value().preview} fallback={<pre class={AGENT_TEXT}>{value().text}</pre>}>
              {(preview) => (
                <img
                  class={props.staged ? STAGED_SNAPSHOT : CARD_SNAPSHOT}
                  src={preview().dataUrl}
                  width={preview().width}
                  height={preview().height}
                  alt={SNAPSHOT_LABEL}
                />
              )}
            </Show>
            <Show when={sourceLine(value())}>{(label) => <span class={SOURCE_LINE}>in {label()}</span>}</Show>
          </div>
        )}
      </Show>
    </Show>
  )
}

function IncompatibleSdkAlert(props: {view: NativeView}): JSX.Element {
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

const ios = Plugin.define({
  setup(ctx) {
    ctx.add(OpaqueNoteCard.toInternal(NoteCard), {
      origins: [GRAB_NOTE_ORIGIN],
      render: (props) => <GrabNoteCard {...props} ui={ctx.ui} />,
    })
    if (window.webkit?.messageHandlers?.concivBridge === undefined) return
    const runtime = ManagedRuntime.make(Layer.effect(NativeLinkService, startNativeLink(ctx.widget)))
    onCleanup(() => void runtime.dispose())
    const link = runtime.runSync(Effect.service(NativeLinkService))

    ctx.add(GrabPicker, makeGrabNotePicker(link, {session: () => ctx.sessions.current(), screen: ctx.screen}))
    ctx.add(Slot, {at: 'page.overlay', hides: false, render: () => <IncompatibleSdkAlert view={link.view} />})
  },
})

export default ios
