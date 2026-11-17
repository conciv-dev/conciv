import {createSignal} from 'solid-js'
import {ComposerPill, Plugin, Slot} from '@conciv/plugin/experimental'
import {WhiteboardOverlay} from './client/overlay.js'

export default Plugin.define({
  setup(ctx) {
    const [open, setOpen] = createSignal(false)
    const overlay: Slot = {
      at: 'page.overlay',
      render: () => <WhiteboardOverlay ctx={ctx} />,
    }
    const pill: ComposerPill = {
      id: 'whiteboard-open',
      order: 20,
      show: () => ({
        label: 'Whiteboard',
        icon: 'presentation',
        title: 'Open the whiteboard canvas',
        run: () => setOpen((value) => !value),
      }),
    }
    ctx.add(ComposerPill, pill)
    // oxlint-disable-next-line solid/reactivity -- ctx.add runs the item function in the host's tracked scope
    ctx.add(Slot, () => (open() ? overlay : undefined))
  },
})
