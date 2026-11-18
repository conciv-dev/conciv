import {Panel, Plugin, type PanelTab} from '@conciv/plugin/experimental'
import {bootCapture} from './client/boot.js'
import {RecorderPanel} from './client/panel-view.js'

export default Plugin.define({
  setup(ctx) {
    const clientId = crypto.randomUUID()
    const capture = bootCapture(ctx, clientId)
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
    ctx.add(Panel, {
      id: 'recorder',
      region: 'pane',
      list: () => [tab],
      render: () => <RecorderPanel clientId={clientId} capture={capture} />,
    })
  },
})
