import {Panel, Plugin} from '@conciv/plugin/experimental'
import {bootCapture} from './client/boot.js'
import {RecorderPanel} from './client/panel-view.js'
import {RECORDER_NAME} from './protocol.js'

const RECORDER_TAB = {id: RECORDER_NAME, title: 'Recorder', pinned: true}

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
  },
})
