import {NoteCard, Panel, Plugin} from '@conciv/plugin/experimental'
import {bootCapture} from './client/boot.js'
import {RecorderPanel} from './client/panel-view.js'
import {RecordingCard} from './client/recording-card.js'

const RECORDER_TAB = {id: 'recorder', title: 'Recorder', pinned: true}

export default Plugin.define({
  setup(ctx) {
    const clientId = crypto.randomUUID()
    const capture = bootCapture(ctx, clientId)
    ctx.add(Panel, {
      id: RECORDER_TAB.id,
      region: 'pane',
      list: () => [RECORDER_TAB],
      render: (panel) => <RecorderPanel clientId={clientId} capture={capture} panel={panel} />,
    })
    ctx.add(NoteCard, {
      origins: [ctx.id],
      render: (props) => <RecordingCard note={props.note} session={props.session} clientId={clientId} />,
    })
  },
})
