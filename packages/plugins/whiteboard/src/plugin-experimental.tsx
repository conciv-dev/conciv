import {getOwner, onCleanup, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {render} from 'solid-js/web'
import {Layer, ManagedRuntime, SubscriptionRef} from 'effect'
import {z} from 'zod'
import {useQuery} from '@conciv/client'
import {ComposerPill, Plugin, SettingsPage, Slot, Style, ToolRegistry, usePlugin} from '@conciv/frontend-plugin-api'
import {Page} from '@conciv/frontend-plugin-api/page'
import {OpaqueUi} from '@internal/frontend-app-api'
import {whiteboardToolCards} from './cards.js'
import {makeCommentCompose} from './comment-compose.js'
import type {ComposePhase} from './comment-compose-machine.js'
import {WhiteboardCanvasMachine} from './canvas-machine.js'
import {ComposePopover} from './compose-popover.js'
import {WhiteboardCanvas, WhiteboardNotices} from './overlay.js'
import {readCanvasBackground, whiteboardStores, type CanvasBackground} from './stores.js'
import type {ChatCover} from './comments-model.js'
import {follow, runInOwnerScope} from './solid-runtime.js'
import pluginCss from 'virtual:uno.css?inline'

const COMMENT_BIND_DEADLINE_MS = 5_000
const ComposeOptions = z.object({
  commentBindDeadlineMs: z.number().positive().default(COMMENT_BIND_DEADLINE_MS).catch(COMMENT_BIND_DEADLINE_MS),
})

const CANVAS_BACKGROUND_ROW = 'settings-whiteboard-canvas-background'
const LABEL = 'Canvas background: see the page through the canvas'

function CanvasBackgroundRow(): JSX.Element {
  const ctx = usePlugin<{stores: typeof whiteboardStores}>()
  const ui = ctx.ui
  const canvas = ctx.stores.canvas
  return (
    <ui.SettingsRow
      id={CANVAS_BACKGROUND_ROW}
      title={LABEL}
      description="Off, the whiteboard draws on a solid background that follows the theme."
    >
      <ui.Switch
        label={LABEL}
        hideLabel
        checked={canvas.value.transparent}
        onChange={(checked) =>
          canvas.update((draft) => {
            draft.transparent = checked
          })
        }
      />
    </ui.SettingsRow>
  )
}

const whiteboard: Plugin.Definition<typeof whiteboardStores> = Plugin.define({
  stores: whiteboardStores,
  setup(ctx) {
    ctx.add(Style, pluginCss)
    const runtime = ManagedRuntime.make(Layer.empty)
    onCleanup(() => void runtime.dispose())
    const [canvas, setCanvas] = createStore<WhiteboardCanvasMachine.CanvasState>({
      ...WhiteboardCanvasMachine.initialCanvas,
    })
    const compose = runInOwnerScope(
      runtime,
      makeCommentCompose(ComposeOptions.parse(ctx.options).commentBindDeadlineMs),
    )
    const phase = follow(runtime, compose.phase)
    const comments = follow(runtime, compose.cover)
    const composing = (): Extract<ComposePhase, {status: 'composing'}> | undefined => {
      const current = phase()
      return current.status === 'composing' ? current : undefined
    }
    const visible = (): boolean => canvas.open && phase().status === 'idle'
    const page = ctx.use(Page)
    const surface = useQuery(() => ({
      queryKey: ['plugin', 'whiteboard', 'canvas-surface'],
      queryFn: () => import('./canvas-surface.js').then((module) => module.default),
      enabled: canvas.engaged,
      retry: false,
      refetchOnWindowFocus: false,
    }))
    const dispatchCanvas = (event: Parameters<typeof WhiteboardCanvasMachine.transitionCanvas>[1]): void => {
      const next = WhiteboardCanvasMachine.transitionCanvas(canvas, event)
      setCanvas(next.state)
      next.effects.forEach(() => void surface.refetch())
    }
    const close = (): void => dispatchCanvas({type: 'closed'})
    const background = (): CanvasBackground => readCanvasBackground(ctx.stores.canvas.value.transparent)
    const layer = document.createElement('div')
    const overlay: Slot = {
      at: 'page.overlay',
      get hides() {
        return visible() && Boolean(comments()?.threadOpen() || comments()?.inboxOpen() || comments()?.prompting())
      },
      render: () => (
        <Show when={visible()}>
          <WhiteboardNotices ctx={ctx} runtime={runtime} surface={surface} layer={layer} />
        </Show>
      ),
    }
    const bindComments = (cover: ChatCover | undefined): void =>
      void runtime.runSync(SubscriptionRef.set(compose.cover, cover))
    const pill: ComposerPill = {
      id: 'whiteboard-open',
      order: 20,
      show: () => ({
        label: 'Whiteboard',
        icon: 'presentation',
        title: 'Open the whiteboard canvas',
        run: () => dispatchCanvas({type: 'toggled', surfaceFailed: surface.isError}),
      }),
    }
    const commentPill: ComposerPill = {
      id: 'whiteboard-comment',
      order: 19,
      show: () => {
        const live = page()
        if (live.status !== 'active' || comments() === undefined) return undefined
        return {
          label: 'Comment',
          icon: 'message-square-plus',
          title: 'Comment on an element',
          run: () => {
            runtime.runFork(
              compose.start({
                pick: () => live.value.pick(),
                canvasOpen: () => canvas.open,
                added: () => void ctx.toast.show({title: 'Comment added to the whiteboard', variant: 'success'}),
                unbound: () =>
                  void ctx.toast.show({
                    title: 'The comment was not added: open the whiteboard and try again',
                    variant: 'error',
                  }),
              }),
            )
          },
        }
      },
    }
    onCleanup(
      render(
        () => (
          <WhiteboardCanvas
            ctx={ctx}
            runtime={runtime}
            surface={surface}
            background={background()}
            visible={visible()}
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
    ctx.add(SettingsPage, {
      id: 'canvas-background',
      page: 'general',
      section: 'general',
      title: 'Whiteboard canvas background',
      entries: [
        {
          id: CANVAS_BACKGROUND_ROW,
          title: 'Canvas background',
          keywords: 'whiteboard canvas background transparent solid',
        },
      ],
      render: () => <CanvasBackgroundRow />,
    })
    ctx.add(ComposerPill, commentPill)
    whiteboardToolCards(OpaqueUi.toInternal(ctx.ui)).forEach((card) => ctx.add(ToolRegistry, card))
    ctx.add(Slot, overlay)
    ctx.add(Slot, {
      at: 'page.overlay',
      get hides() {
        return composing() !== undefined
      },
      render: () => (
        <Show when={composing()} keyed>
          {(current) => (
            <ComposePopover
              ui={ctx.ui}
              anchor={current.anchor}
              answer={(text) => void runtime.runFork(compose.answer(text))}
            />
          )}
        </Show>
      ),
    })
  },
})

export default whiteboard
