import {onCleanup} from 'solid-js'
import {Layer, ManagedRuntime} from 'effect'
import {NoteCard, Panel, Plugin, type PanelTab} from '@conciv/plugin/experimental'
import {bootCapture} from './page-capture.js'
import {RecorderPanel} from './panel-view.js'
import {RecordingCard} from './recording-card.js'
import {runInOwnerScope, subscriptionRefSignal} from './subscription-ref-signal.js'

export default Plugin.define({
  setup(ctx) {
    const recorderTab: PanelTab = {
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
    const runtime = ManagedRuntime.make(Layer.empty)
    onCleanup(() => void runtime.dispose())
    const clientId = crypto.randomUUID()
    const capture = runInOwnerScope(runtime, bootCapture(ctx, runtime, clientId))
    const boot = subscriptionRefSignal(runtime, capture.boot)
    const captureFailed = () => boot().status === 'failed'
    ctx.add(Panel, {
      id: recorderTab.id,
      region: 'pane',
      list: () => [recorderTab],
      render: (host) => (
        <RecorderPanel
          clientId={clientId}
          runtime={runtime}
          captureFailed={captureFailed}
          flushNow={capture.flushNow}
          host={host}
        />
      ),
    })
    ctx.add(NoteCard, {
      origins: [ctx.id],
      render: (props) => (
        <RecordingCard note={props.note} session={props.session} clientId={clientId} runtime={runtime} />
      ),
    })
  },
})
