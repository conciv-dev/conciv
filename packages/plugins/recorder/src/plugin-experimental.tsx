import {onCleanup} from 'solid-js'
import {Layer, ManagedRuntime} from 'effect'
import {Panel, Plugin, type PanelTab} from '@conciv/plugin/experimental'
import {bootCapture} from './page-capture.js'
import {RecorderPanel} from './panel-view.js'
import {runInOwnerScope, subscriptionRefSignal} from './subscription-ref-signal.js'

export default Plugin.define({
  setup(ctx) {
    const runtime = ManagedRuntime.make(Layer.empty)
    onCleanup(() => void runtime.dispose())
    const clientId = crypto.randomUUID()
    const tab: PanelTab = {
      id: 'recorder',
      title: 'Recorder',
      pinned: true,
      label: () => (
        <>
          <ctx.ui.Icon name="clapperboard" size="small" />
          Recorder
        </>
      ),
    }
    const boot = subscriptionRefSignal(runtime, runInOwnerScope(runtime, bootCapture(ctx, runtime, clientId)))
    const captureFailed = () => boot().status === 'failed'
    ctx.add(Panel, {
      id: 'recorder',
      region: 'pane',
      list: () => [tab],
      render: () => <RecorderPanel clientId={clientId} runtime={runtime} captureFailed={captureFailed} />,
    })
  },
})
