import {onCleanup} from 'solid-js'
import {Plugin, Slot} from '@conciv/plugin/experimental'
import {PageOperation, ReactTree} from '@conciv/plugin/experimental/page'
import {installRuntimeErrorListeners} from './client/error-ring.js'
import {InspectorChip} from './client/inspector-chip.js'
import {makeTanstackOperations} from './client/operations.js'
import {Operations} from './rpc.js'

export default Plugin.define({
  setup(ctx) {
    const operations = makeTanstackOperations(ctx.use(ReactTree))

    Operations.forEach((operation) =>
      ctx.add(PageOperation, {
        name: `tanstack.${operation.name}`,
        run: (input, signal) => operations.execute(operation.name, input, signal),
      }),
    )

    ctx.add(Slot, {at: 'session.status', render: () => <InspectorChip ui={ctx.ui} />})

    onCleanup(installRuntimeErrorListeners())
  },
})
