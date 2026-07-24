import {createFileRoute, useBlocker, useRouter} from '@tanstack/solid-router'
import {For, Show, createMemo, type JSX} from 'solid-js'
import {HostApiProvider} from '@conciv/extension'
import {MountedView} from '@conciv/extension/client'
import {useAppData, useInstances, useRpc} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {collectViews} from '../extension/extension-views.js'
import {makePaneGrabApi} from '../extension/pane-grab.js'
import {GrabReference} from '../chat/grab-reference.js'

const GRAB_PREVIEW_MAX_W = 280

export const Route = createFileRoute('/panel/$sessionId/$view')({component: PanelView})

function PanelView(): JSX.Element {
  const params = Route.useParams()
  const rpc = useRpc()
  const appData = useAppData()
  const instances = useInstances()
  const pane = usePane()
  const router = useRouter()

  const views = createMemo(() => collectViews(instances))
  const view = () => views().find((candidate) => candidate.id === params().view)

  useBlocker({
    shouldBlockFn: ({current, next}) =>
      pane.viewLocked() && next.pathname.startsWith('/panel') && next.pathname !== current.pathname,
  })

  const appendDraft = async (text: string) => {
    const row = await rpc.drafts.get({sessionId: params().sessionId})
    const nextText = row?.text ? `${row.text}\n${text}` : text
    await rpc.drafts.set({
      sessionId: params().sessionId,
      text: nextText,
      selectionStart: nextText.length,
      selectionEnd: nextText.length,
      grabs: row?.grabs ?? [],
    })
  }

  const newSession = () => {
    void rpc.sessions.create(undefined).then(({sessionId}) => {
      appData.invalidateSessions()
      void router.navigate({to: '/panel/$sessionId', params: {sessionId}})
    })
  }

  return (
    <Show when={view()}>
      {(active) => (
        <HostApiProvider
          sessionId={() => params().sessionId}
          grab={makePaneGrabApi(pane.grabStore, pane.grabProvider)}
          insert={(text) => void appendDraft(text).catch(() => {})}
          attach={(file) => pane.attachments.enqueue(file)}
          newSession={newSession}
          viewLock={pane.setLockedFor(params().view)}
          viewLeave={() =>
            void router.navigate({to: '/panel/$sessionId', params: {sessionId: params().sessionId}, replace: true})
          }
        >
          <div
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) pane.resetSlide()
            }}
            class={`flex flex-1 flex-col min-h-0 ${pane.slideClass()}`}
          >
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
            <MountedView view={active()} clientValue={active().instance.clientValue} />
          </div>
        </HostApiProvider>
      )}
    </Show>
  )
}
