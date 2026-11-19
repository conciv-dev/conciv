import {onCleanup} from 'solid-js'
import {Effect, Exit, Layer, Scope} from 'effect'
import {Plugin, Slot} from '@conciv/plugin/experimental'
import {PageOperation, ReactTree} from '@conciv/plugin/experimental/page'
import {errorRingLayer} from './error-ring.js'
import {InspectorChip} from './inspector-chip.js'
import {execute} from './operations.js'
import {Operations} from './rpc.js'

export default Plugin.define({
  setup(ctx) {
    const tree = ctx.use(ReactTree)
    const scope = Effect.runSync(Scope.make())
    const services = Effect.runSync(Layer.buildWithScope(errorRingLayer, scope))
    onCleanup(() => Effect.runFork(Scope.close(scope, Exit.void)))

    Operations.forEach((operation) =>
      ctx.add(PageOperation, {
        name: `tanstack.${operation.name}`,
        run: (input, signal) =>
          Effect.runPromise(execute(operation.name, input, tree()).pipe(Effect.provideContext(services)), {signal}),
      }),
    )

    ctx.add(Slot, {at: 'session.status', render: () => <InspectorChip ui={ctx.ui} />})
  },
})
