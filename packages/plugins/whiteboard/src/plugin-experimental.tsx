import {createResource, createSignal, onCleanup} from 'solid-js'
import {render} from 'solid-js/web'
import {ComposerPill, Plugin, Slot} from '@conciv/plugin/experimental'
import {WhiteboardCanvas, WhiteboardNotices} from './client/overlay.js'

export default Plugin.define({
  setup(ctx) {
    const [open, setOpen] = createSignal(false)
    const [engaged, setEngaged] = createSignal(false)
    const [surface] = createResource(engaged, () => import('./client/canvas-surface.js'))
    const close = (): void => void setOpen(false)
    const overlay: Slot = {
      at: 'page.overlay',
      hides: false,
      render: () => <WhiteboardNotices ctx={ctx} surface={surface} />,
    }
    const pill: ComposerPill = {
      id: 'whiteboard-open',
      order: 20,
      show: () => ({
        label: 'Whiteboard',
        icon: 'presentation',
        title: 'Open the whiteboard canvas',
        run: () => {
          setEngaged(true)
          setOpen((value) => !value)
        },
      }),
    }
    onCleanup(
      render(
        () => <WhiteboardCanvas ctx={ctx} surface={surface} visible={open()} close={close} />,
        document.createDocumentFragment(),
      ),
    )
    ctx.add(ComposerPill, pill)
    // oxlint-disable-next-line solid/reactivity -- ctx.add runs the item function in the host's tracked scope
    ctx.add(Slot, () => (open() ? overlay : undefined))
  },
})
