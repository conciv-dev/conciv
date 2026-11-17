import {Panel, Plugin} from '@conciv/plugin/experimental'
import {bootCapture} from './client/boot.js'
import {RecorderPanel} from './client/panel-view.js'

const RECORDER_TAB = {id: 'recorder', title: 'Recorder', pinned: true}

export default Plugin.define({
  setup(ctx) {
    const clientId = crypto.randomUUID()
    const capture = bootCapture(ctx, clientId)
    ctx.add(Panel, {
      id: 'recorder',
      region: 'pane',
      list: () => [RECORDER_TAB],
      render: () => <RecorderPanel clientId={clientId} capture={capture} />,
    })
  },
})
