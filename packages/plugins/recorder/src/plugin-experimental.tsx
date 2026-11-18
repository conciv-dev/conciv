import {NoteCard, Panel, Plugin, type PanelTab} from '@conciv/plugin/experimental'
import {bootCapture} from './client/boot.js'
import {RecorderPanel} from './client/panel-view.js'
import {RecordingCard} from './client/recording-card.js'

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
    const clientId = crypto.randomUUID()
    const capture = bootCapture(ctx, clientId)
    ctx.add(Panel, {
      id: recorderTab.id,
      region: 'pane',
      list: () => [recorderTab],
      render: (panel) => <RecorderPanel clientId={clientId} capture={capture} panel={panel} />,
    })
    ctx.add(NoteCard, {
      origins: [ctx.id],
      render: (props) => <RecordingCard note={props.note} session={props.session} clientId={clientId} />,
    })
  },
})
