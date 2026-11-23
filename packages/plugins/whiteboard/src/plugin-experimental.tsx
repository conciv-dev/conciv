import {from, getOwner, onCleanup, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {render} from 'solid-js/web'
import {Effect, Exit, Fiber, Scope, Stream, SubscriptionRef} from 'effect'
import {z} from 'zod'
import {useQuery} from '@conciv/client'
import {ComposerPill, Plugin, SettingsPage, Slot, ToolRegistry, usePlugin} from '@conciv/plugin/experimental'
import {readConcivUi} from '@conciv/plugin-internal'
import {Page} from '@conciv/plugin/experimental/page'
import {whiteboardToolCards} from './cards.js'
import {makeCommentCompose, type ComposePhase} from './comment-compose.js'
import {ComposePopover} from './compose-popover.js'
import {WhiteboardCanvas, WhiteboardNotices} from './overlay.js'
import {readCanvasBackground, whiteboardStores, type CanvasBackground} from './stores.js'
import type {ChatCover} from './comments-model.js'

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

function refAccessor<A>(ref: SubscriptionRef.SubscriptionRef<A>, initial: A): Accessor<A> {
  return from<A>((set) => {
    const fiber = Effect.runFork(
      Stream.runForEach(SubscriptionRef.changes(ref), (value) => Effect.sync(() => void set(() => value))),
    )
    return () => void Effect.runFork(Fiber.interrupt(fiber))
  }, initial)
}

const whiteboard: Plugin.Definition<typeof whiteboardStores> = Plugin.define({
  stores: whiteboardStores,
  setup(ctx) {
    const [canvas, setCanvas] = createStore({open: false, engaged: false})
    const scope = Effect.runSync(Scope.make())
    onCleanup(() => void Effect.runFork(Scope.close(scope, Exit.void)))
    const compose = Effect.runSync(
      makeCommentCompose(ComposeOptions.parse(ctx.options).commentBindDeadlineMs).pipe(Scope.provide(scope)),
    )
    const phase = refAccessor(compose.phase, {status: 'idle'})
    const comments = refAccessor<ChatCover | undefined>(compose.cover, undefined)
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
    const close = (): void => setCanvas('open', false)
    const background = (): CanvasBackground => readCanvasBackground(ctx.stores.canvas.value.transparent)
    const layer = document.createElement('div')
    const overlay: Slot = {
      at: 'page.overlay',
      get hides() {
        return visible() && Boolean(comments()?.threadOpen() || comments()?.inboxOpen() || comments()?.prompting())
      },
      render: () => <WhiteboardNotices ctx={ctx} surface={surface} layer={layer} />,
    }
    const bindComments = (cover: ChatCover | undefined): void =>
      void Effect.runSync(SubscriptionRef.set(compose.cover, cover))
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
            Effect.runFork(
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
    whiteboardToolCards(readConcivUi(ctx)).forEach((card) => ctx.add(ToolRegistry, card))
    // oxlint-disable-next-line solid/reactivity -- ctx.add runs the item function in the host's tracked scope
    ctx.add(Slot, () => (visible() ? overlay : undefined))
    // oxlint-disable-next-line solid/reactivity -- ctx.add runs the item function in the host's tracked scope
    ctx.add(Slot, (): Slot | undefined => {
      const current = composing()
      if (!current) return undefined
      return {
        at: 'page.overlay',
        render: () => (
          <ComposePopover
            ui={ctx.ui}
            anchor={current.anchor}
            answer={(text) => void Effect.runFork(compose.answer(text))}
          />
        ),
      }
    })
  },
})

export default whiteboard
