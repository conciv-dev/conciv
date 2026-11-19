import {Effect, Exit, Fiber, Layer, Scope, Stream, SubscriptionRef} from 'effect'
import {from, onCleanup, type Accessor} from 'solid-js'
import {Plugin, Server, type ServerEntry} from '@conciv/plugin/experimental'
import {connectPorts} from '@conciv/protocol/connect-ports'
import {connect} from './connect.js'
import {awaitingFirstSweep, type ConnectState} from './connect-machine.js'
import {ConnectPane} from './connect-pane.js'
import {localNetworkAccess} from './local-network-access.js'
import {TryItOptions} from './options.js'
import {probeCore, TryItProbe} from './probe.js'

function follow<A>(ref: SubscriptionRef.SubscriptionRef<A>): Accessor<A> {
  return from<A>((set) => {
    const fiber = Effect.runFork(
      Stream.runForEach(SubscriptionRef.changes(ref), (value) => Effect.sync(() => set(() => value))),
    )
    return () => void Effect.runFork(Fiber.interrupt(fiber))
  }, SubscriptionRef.getUnsafe(ref))
}

function entry(state: ConnectState, cover: ServerEntry['cover']): ServerEntry {
  if (state.status === 'connected') return {id: 'core', name: 'conciv', state: 'ready', http: {url: state.base}, cover}
  return {id: 'core', name: 'conciv', state: 'starting', cover}
}

export default Plugin.define({
  setup(ctx) {
    const options = TryItOptions.parse(ctx.options)
    const scope = Effect.runSync(Scope.make())
    onCleanup(() => void Effect.runFork(Scope.close(scope, Exit.void)))
    const started = Effect.runSync(
      Effect.all({
        connection: connect({timings: options}),
        access: localNetworkAccess(),
      }).pipe(
        Effect.provide(Layer.succeed(TryItProbe, {probe: probeCore(options.token, connectPorts(), options.probeMs)})),
        Scope.provide(scope),
      ),
    )
    const state = follow(started.connection.state)
    const access = follow(started.access)
    const copied = () => void Effect.runFork(started.connection.dispatch({type: 'copied'}))
    const cover = () => (
      <ConnectPane token={options.token} state={state} localNetworkAccess={access} onCopied={copied} />
    )

    ctx.add(Server, () => ({ready: !awaitingFirstSweep(state()), order: 0, entries: [entry(state(), cover)]}))
  },
})
