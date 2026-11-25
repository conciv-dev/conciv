import {ComposerPill, Plugin, Slot, type ComposerPillView} from '@conciv/frontend-plugin-api'

export default Plugin.define({
  setup(ctx) {
    const view: ComposerPillView = {
      label: 'Deploy',
      icon: 'arrow-up',
      run: () => ctx.toast.show({title: 'Deploy requested'}),
    }
    ctx.add(ComposerPill, {id: 'deploy', show: () => view})
    ctx.add(Slot, {at: 'session.status', render: () => <span>env: staging</span>})
  },
})
