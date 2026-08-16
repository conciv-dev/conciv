import {createFileRoute, redirect, useBlocker, useRouter} from '@tanstack/solid-router'
import {Show, Suspense, createMemo, type JSX} from 'solid-js'
import {HostApiProvider} from '@conciv/extension/host'
import {MountedView} from '@conciv/extension/client'
import {useAppData, useConnectionGeneration, useInstances, useRpc} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {collectViews} from '../extension/extension-views.js'
import {makePaneGrabApi} from '../extension/pane-grab.js'
import {appendDraft} from '../pane/draft-storage.js'

export const Route = createFileRoute('/panel/$sessionId/$view')({
  beforeLoad: ({context, params}) => {
    if (collectViews(context.instances).some((view) => view.id === params.view)) return
    throw redirect({to: '/panel/$sessionId', params: {sessionId: params.sessionId}, replace: true})
  },
  component: PanelView,
})

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
          grab={makePaneGrabApi(pane.grabStaging, pane.grabProvider)}
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
            <Suspense>
              <MountedView view={mount.view} clientValue={mount.view.instance.clientValue} />
            </Suspense>
          </div>
        </HostApiProvider>
      )}
    </Show>
  )
}
