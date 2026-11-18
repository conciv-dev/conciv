import {createResource, getOwner, onCleanup} from 'solid-js'
import {createStore} from 'solid-js/store'
import {render} from 'solid-js/web'
import {Effect, Exit, Scope, SubscriptionRef} from 'effect'
import {ComposerPill, Plugin, Slot} from '@conciv/plugin/experimental'
import {GrabApi} from '@conciv/plugin/experimental/grab'
import {makeCommentCompose} from './client/comment-compose.js'
import {refAccessor} from './client/ref-accessor.js'
import {WhiteboardCanvas, WhiteboardNotices} from './client/overlay.js'
import {whiteboardStores} from './client/stores.js'
import type {ChatCover} from './client/model/comments-model.js'

export default Plugin.define({
  stores: whiteboardStores,
  setup(ctx) {
    const [canvas, setCanvas] = createStore({open: false, engaged: false})
    const scope = Effect.runSync(Scope.make())
    onCleanup(() => void Effect.runFork(Scope.close(scope, Exit.void)))
    const compose = Effect.runSync(makeCommentCompose.pipe(Scope.provide(scope)))
    const phase = refAccessor(compose.phase, {status: 'idle'})
    const comments = refAccessor<ChatCover | undefined>(compose.cover, undefined)
    const visible = (): boolean => canvas.open && phase().status === 'idle'
    const grab = ctx.use(GrabApi)
    const [surface, {refetch}] = createResource(
      () => canvas.engaged,
      () => import('./client/canvas-surface.js'),
    )
    const close = (): void => setCanvas('open', false)
    const layer = document.createElement('div')
    const overlay: Slot = {
      at: 'page.overlay',
      get hides() {
        return visible() && Boolean(comments()?.threadOpen() || comments()?.prompting())
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
          if (surface.error === undefined) {
            setCanvas({engaged: true, open: !canvas.open})
            return
          }
          setCanvas('open', true)
          void refetch()
        },
      }),
    }
    const commentPill: ComposerPill = {
      id: 'whiteboard-comment',
      order: 19,
      show: () => {
        const live = grab()
        if (live.status !== 'active') return undefined
        return {
          label: 'Comment',
          icon: 'message-square-plus',
          title: 'Comment on an element',
          run: () => {
            setCanvas('engaged', true)
            if (surface.error !== undefined) void refetch()
            Effect.runFork(
              compose.start({
                pick: () => live.value.comment(),
                ask: () =>
                  ctx.dialogs.prompt({title: 'New comment', placeholder: 'Add a comment', submit: 'Add comment'}),
                canvasOpen: () => canvas.open,
                added: () => void ctx.toast.show({title: 'Comment added to the whiteboard', variant: 'success'}),
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
    ctx.add(ComposerPill, commentPill)
    // oxlint-disable-next-line solid/reactivity -- ctx.add runs the item function in the host's tracked scope
    ctx.add(Slot, () => (visible() ? overlay : undefined))
  },
})
