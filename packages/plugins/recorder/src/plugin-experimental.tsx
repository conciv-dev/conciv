import {Panel, Plugin} from '@conciv/plugin/experimental'
import {RecorderPanel} from './client/panel-view.js'

const RECORDER_TAB = {id: 'recorder', title: 'Recorder', pinned: true}

export default Plugin.define({
  setup(ctx) {
    const clientId = crypto.randomUUID()
    ctx.add(Panel, {
      id: 'recorder',
      region: 'pane',
      list: () => [RECORDER_TAB],
      render: () => <RecorderPanel clientId={clientId} />,
    })
  },
})
