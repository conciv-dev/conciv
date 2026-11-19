import {onCleanup} from 'solid-js'
import {createStore} from 'solid-js/store'
import {render} from 'solid-js/web'
import {useQuery} from '@conciv/client'
import {ComposerPill, Plugin, Slot} from '@conciv/plugin/experimental'
import {WhiteboardCanvas, WhiteboardNotices} from './client/overlay.js'

export default Plugin.define({
  setup(ctx) {
    const [canvas, setCanvas] = createStore({open: false, engaged: false})
    const surface = useQuery(() => ({
      queryKey: ['plugin', 'whiteboard', 'canvas-surface'],
      queryFn: () => import('./client/canvas-surface.js').then((module) => module.default),
      enabled: canvas.engaged,
      retry: false,
      refetchOnWindowFocus: false,
    }))
    const close = (): void => setCanvas('open', false)
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
          if (!surface.isError) {
            setCanvas({engaged: true, open: !canvas.open})
            return
          }
          setCanvas('open', true)
          void surface.refetch()
        },
      }),
    }
    onCleanup(
      render(
        () => <WhiteboardCanvas ctx={ctx} surface={surface} visible={canvas.open} close={close} />,
        document.createDocumentFragment(),
      ),
    )
    ctx.add(ComposerPill, pill)
    // oxlint-disable-next-line solid/reactivity -- ctx.add runs the item function in the host's tracked scope
    ctx.add(Slot, () => (canvas.open ? overlay : undefined))
  },
})
