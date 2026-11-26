import {Effect, Fiber, Layer, type ManagedRuntime, Scope, Stream, SubscriptionRef} from 'effect'
import {from, type Accessor} from 'solid-js'
import {createScopedRuntime, Plugin, Server, type ServerEntry} from '@conciv/frontend-plugin-api'
import {connectPorts} from '@conciv/types/connect-ports'
import {connect} from './connect.js'
import {TryItConnectMachine} from './connect-machine.js'
import {ConnectPane} from './connect-pane.js'
import {localNetworkAccess} from './local-network-access.js'
import {probeCore, TryItProbe} from './probe.js'
import {z} from 'zod'

const Milliseconds = z.number().int().positive()

const TryItOptions = z.object({
  token: z.uuid(),
  probeMs: Milliseconds.default(2_000),
  holdMs: Milliseconds.default(600),
  slowMs: Milliseconds.default(60_000),
})

function follow<A>(
  runtime: ManagedRuntime.ManagedRuntime<never, never>,
  ref: SubscriptionRef.SubscriptionRef<A>,
): Accessor<A> {
  return from<A>((set) => {
    const fiber = runtime.runFork(
      Stream.runForEach(SubscriptionRef.changes(ref), (value) => Effect.sync(() => set(() => value))),
    )
    return () => void runtime.runFork(Fiber.interrupt(fiber))
  }, SubscriptionRef.getUnsafe(ref))
}

function entry(state: TryItConnectMachine.ConnectState, token: string, cover: ServerEntry['cover']): ServerEntry {
  if (state.status === 'connected') {
    return {id: 'core', name: 'conciv', state: 'ready', http: {url: state.base, password: token}, cover}
  }
  return {id: 'core', name: 'conciv', state: 'starting', cover}
}

const tryIt: Plugin.Definition = Plugin.define({
  setup(ctx) {
    const options = TryItOptions.parse(ctx.options)
    const {runtime, scope} = createScopedRuntime(
      Layer.succeed(TryItProbe, {probe: probeCore(options.token, connectPorts(), options.probeMs)}),
    )
    const started = runtime.runSync(
      Effect.all({
        connection: connect({timings: options}),
        access: localNetworkAccess(),
      }).pipe(Scope.provide(scope)),
    )
    const state = follow(runtime, started.connection.state)
    const access = follow(runtime, started.access)
    const copied = () => void runtime.runFork(started.connection.dispatch({type: 'copied'}))
    const cover = () => (
      <ConnectPane ui={ctx.ui} token={options.token} state={state} localNetworkAccess={access} onCopied={copied} />
    )

    ctx.add(Server, () => ({
      ready: !TryItConnectMachine.awaitingFirstSweep(state()),
      order: 0,
      entries: [entry(state(), options.token, cover)],
    }))
  },
})

export default tryIt
