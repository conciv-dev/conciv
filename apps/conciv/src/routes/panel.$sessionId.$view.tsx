import {createFileRoute, useBlocker, useRouter} from '@tanstack/solid-router'
import {useQuery} from '@tanstack/solid-query'
import {For, Show, createMemo, type JSX} from 'solid-js'
import {MountedView} from '@conciv/extension/client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {useApp} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {collectViews} from '../extension/extension-views.js'
import {makeHostBag, makePaneGrabApi} from '../extension/host-bag.js'
import {GrabReference} from '../chat/grab-reference.js'

const GRAB_PREVIEW_MAX_W = 280

export const Route = createFileRoute('/panel/$sessionId/$view')({component: PanelView})

function PanelView(): JSX.Element {
  const params = Route.useParams()
  const app = useApp()
  const pane = usePane()
  const router = useRouter()
  const meta = useQuery(() => app.data.utils.meta.models.queryOptions())

  const views = createMemo(() => collectViews(app.instances()))
  const view = () => views().find((candidate) => candidate.id === params().view)

  useBlocker({
    shouldBlockFn: ({current, next}) =>
      pane.viewLocked() && next.pathname.startsWith('/panel') && next.pathname !== current.pathname,
  })

  const toolCtx: ToolViewCtx = {
    apiBase: '',
    harnessId: meta.data?.harness.id ?? '',
    sendMessage: (text) => void app.rpc.chat.send({sessionId: params().sessionId, text}).catch(() => {}),
    respondApproval: (approvalId, approved) => {
      void app.rpc.chat.permissionDecision({approvalId, approved}).catch(() => {})
    },
  }

  const appendDraft = async (text: string) => {
    const row = await app.rpc.drafts.get({sessionId: params().sessionId})
    const nextText = row?.text ? `${row.text}\n${text}` : text
    await app.rpc.drafts.set({
      sessionId: params().sessionId,
      text: nextText,
      selectionStart: nextText.length,
      selectionEnd: nextText.length,
      grabs: row?.grabs ?? [],
    })
  }

  const bag = () =>
    makeHostBag({
      app,
      sessionId: params().sessionId,
      toolCtx,
      insert: (text) => void appendDraft(text).catch(() => {}),
      notify: (message) => app.announce(message),
      newSession: () => {
        void app.rpc.sessions.create(undefined).then(({sessionId}) => {
          app.data.invalidateSessions()
          void router.navigate({to: '/panel/$sessionId', params: {sessionId}})
        })
      },
      compact: () => void app.rpc.sessions.compact({sessionId: params().sessionId}).catch(() => {}),
      grab: makePaneGrabApi(pane.grabStore),
      view: {
        setLocked: pane.setLockedFor(params().view),
        leave: () =>
          void router.navigate({to: '/panel/$sessionId', params: {sessionId: params().sessionId}}),
        onInsert: () => {},
      },
    })

  return (
    <Show when={view()}>
      {(active) => (
        <div class={`flex flex-1 flex-col min-h-0 ${pane.slideClass()}`}>
          <Show when={pane.grabStore.grabs().length > 0}>
            <div class="px-2.5 pt-2 flex flex-wrap gap-2">
              <For each={pane.grabStore.grabs()}>
                {(grab) => (
                  <GrabReference
                    grab={grab}
                    maxWidth={GRAB_PREVIEW_MAX_W}
                    onRemove={() => pane.grabStore.remove(grab)}
                  />
                )}
              </For>
            </div>
          </Show>
          <MountedView view={active()} hostContext={bag()} clientValue={active().instance.clientValue} />
        </div>
      )}
    </Show>
  )
}
