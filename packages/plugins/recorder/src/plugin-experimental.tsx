import {onCleanup} from 'solid-js'
import {Layer, ManagedRuntime} from 'effect'
import {Panel, Plugin} from '@conciv/plugin/experimental'
import {bootCapture} from './page-capture.js'
import {RecorderPanel} from './panel-view.js'
import {runInOwnerScope, subscriptionRefSignal} from './subscription-ref-signal.js'

const RECORDER_TAB = {id: 'recorder', title: 'Recorder', pinned: true}

export default Plugin.define({
  setup(ctx) {
    const runtime = ManagedRuntime.make(Layer.empty)
    onCleanup(() => void runtime.dispose())
    const clientId = crypto.randomUUID()
    const boot = subscriptionRefSignal(runtime, runInOwnerScope(runtime, bootCapture(ctx, runtime, clientId)))
    const captureFailed = () => boot().status === 'failed'
    ctx.add(Panel, {
      id: 'recorder',
      region: 'pane',
      list: () => [RECORDER_TAB],
      render: () => <RecorderPanel clientId={clientId} runtime={runtime} captureFailed={captureFailed} />,
    })
  },
})
