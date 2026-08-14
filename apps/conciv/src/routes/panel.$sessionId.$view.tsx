import {createFileRoute, useBlocker, useRouter} from '@tanstack/solid-router'
import {For, Show, Suspense, createMemo, type JSX} from 'solid-js'
import {HostApiProvider} from '@conciv/extension'
import {MountedView} from '@conciv/extension/client'
import {useAppData, useConnectionGeneration, useInstances, useRpc} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {collectViews} from '../extension/extension-views.js'
import {makePaneGrabApi} from '../extension/pane-grab.js'
import {appendDraft} from '../pane/draft-storage.js'
import {GrabReference} from '../pane/grab-reference.js'

export const Route = createFileRoute('/panel/$sessionId/$view')({component: PanelView})

function PanelView(): JSX.Element {
  const params = Route.useParams()
  const rpc = useRpc()
  const appData = useAppData()
  const instances = useInstances()
  const pane = usePane()
  const router = useRouter()
  const generation = useConnectionGeneration()

  const views = createMemo(() => collectViews(instances))
  const view = () => views().find((candidate) => candidate.id === params().view)
  const mountKey = () => {
    const active = view()
    return active ? {view: active, generation: generation()} : undefined
  }

  useBlocker({
    shouldBlockFn: ({current, next}) =>
      pane.viewLocked() && next.pathname.startsWith('/panel') && next.pathname !== current.pathname,
  })

  const newSession = () => {
    void rpc.sessions.create(undefined).then(({sessionId}) => {
      appData.invalidateSessions()
      void router.navigate({to: '/panel/$sessionId', params: {sessionId}})
    })
  }

  return (
    <Show when={mountKey()} keyed>
      {(mount) => (
        <HostApiProvider
          sessionId={() => params().sessionId}
          grab={makePaneGrabApi(pane.grabStore, pane.grabProvider)}
          insert={(text) => void appendDraft(rpc, params().sessionId, text).catch(() => {})}
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
              <div class="px-2.5 pt-2 flex flex-wrap gap-2 min-h-0 max-h-28 overflow-y-auto">
                <For each={pane.grabStore.grabs()}>
                  {(grab) => <GrabReference grab={grab} onRemove={() => pane.grabStore.remove(grab)} />}
                </For>
              </div>
            </Show>
            <Suspense>
              <MountedView view={mount.view} clientValue={mount.view.instance.clientValue} />
            </Suspense>
          </div>
        </HostApiProvider>
      )}
    </Show>
  )
}
