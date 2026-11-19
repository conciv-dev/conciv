import {onCleanup, type JSX} from 'solid-js'
import {Effect, Exit, Layer, Scope} from 'effect'
import {Plugin, Slot, type Ui} from '@conciv/plugin/experimental'
import {PageOperation, ReactTree} from '@conciv/plugin/experimental/page'
import {errorRingLayer} from './error-ring.js'
import {execute} from './operations.js'
import {Operations} from './rpc.js'
import {TanStackLogo} from './tanstack-logo.js'

const LABEL = 'TanStack inspector active'

function InspectorChip(props: {readonly ui: Ui}): JSX.Element {
  return (
    <props.ui.Tooltip value={LABEL}>
      <span role="status" aria-label={LABEL} class="inline-flex gap-1.25 whitespace-nowrap items-center">
        <TanStackLogo class="shrink-0 size-3.5 block" aria-hidden="true" />
        {LABEL}
      </span>
    </props.ui.Tooltip>
  )
}

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
