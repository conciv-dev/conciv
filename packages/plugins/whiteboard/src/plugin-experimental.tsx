import {createResource, getOwner, onCleanup} from 'solid-js'
import {createStore} from 'solid-js/store'
import {render} from 'solid-js/web'
import {ComposerPill, Plugin, Slot} from '@conciv/plugin/experimental'
import {WhiteboardCanvas, WhiteboardNotices} from './overlay.js'
import {whiteboardStores} from './stores.js'
import type {ChatCover} from './comments-model.js'

export default Plugin.define({
  stores: whiteboardStores,
  setup(ctx) {
    const [canvas, setCanvas] = createStore<{open: boolean; engaged: boolean; comments: ChatCover | undefined}>({
      open: false,
      engaged: false,
      comments: undefined,
    })
    const [surface, {refetch}] = createResource(
      () => canvas.engaged,
      () => import('./canvas-surface.js'),
    )
    const close = (): void => setCanvas('open', false)
    const layer = document.createElement('div')
    const overlay: Slot = {
      at: 'page.overlay',
      get hides() {
        return canvas.open && Boolean(canvas.comments?.threadOpen() || canvas.comments?.prompting())
      },
      render: () => <WhiteboardNotices ctx={ctx} surface={surface} layer={layer} />,
    }
    const bindComments = (comments: ChatCover | undefined): void => void setCanvas({comments})
    const pill: ComposerPill = {
      id: 'whiteboard-open',
      order: 20,
      show: () => ({
        label: 'Whiteboard',
        icon: 'presentation',
        title: 'Open the whiteboard canvas',
        run: () => {
          if (surface.error === undefined) {
            setCanvas({engaged: true, open: !canvas.open})
            return
          }
          setCanvas('open', true)
          void refetch()
        },
      }),
    }
    onCleanup(
      render(
        () => (
          <WhiteboardCanvas
            ctx={ctx}
            surface={surface}
            visible={canvas.open}
            layer={layer}
            close={close}
            bindComments={bindComments}
          />
        ),
        document.createDocumentFragment(),
        undefined,
        {owner: getOwner()},
      ),
    )
    ctx.add(ComposerPill, pill)
    // oxlint-disable-next-line solid/reactivity -- ctx.add runs the item function in the host's tracked scope
    ctx.add(Slot, () => (canvas.open ? overlay : undefined))
  },
})
