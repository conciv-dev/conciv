import {Outlet, createFileRoute, redirect, useBlocker, useRouter} from '@tanstack/solid-router'
import {Show, createMemo, createSignal, type JSX} from 'solid-js'
import {HostApiProvider} from '@conciv/extension/host'
import {MountedView} from '@conciv/extension/client'
import {useConnectionGeneration, useInstances} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {PluginBoundary} from '../runtime/plugin/plugin-boundary.js'
import {collectViews} from '../extension/extension-views.js'
import {makePaneGrabApi} from '../pane/pane-grab.js'
import {useStartSession} from '../app/start-session.js'
import {viewTabPanelAttributes} from '../pane/view-tab-ids.js'
import {isPluginView} from '../runtime/plugin/panel-keys.js'
import {PluginTabContent} from '../shell/plugin-surfaces.js'

export const Route = createFileRoute('/panel/$sessionId/$view')({
  beforeLoad: ({context, params}) => {
    const extensionViews = collectViews(context.instances)

    if (extensionViews.some((view) => view.id === params.view)) return
    if (
      isPluginView(params.view, extensionViews) &&
      context.pluginPanels.status({sessionId: params.sessionId, key: params.view}) !== 'unlisted'
    )
      return
    throw redirect({to: '/panel/$sessionId', params: {sessionId: params.sessionId}, replace: true})
  },
  component: PanelView,
})

function PanelView(): JSX.Element {
  const params = Route.useParams()
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
    shouldBlockFn: ({next}) => {
      if (!pane.viewLocked() || !next.pathname.startsWith('/panel')) return false
      if (next.routeId !== '/panel/$sessionId/$view' && next.routeId !== '/panel/$sessionId/$view/options') return true
      return next.params.sessionId !== params().sessionId || next.params.view !== params().view
    },
  })

  const startSession = useStartSession()
  const newSession = () => {
    void startSession()
      .then(({sessionId}) => router.navigate({to: '/panel/$sessionId', params: {sessionId}}))
      .catch(() => undefined)
  }

  const [content, setContent] = createSignal<HTMLDivElement>()

  return (
    <>
      <Show when={mountKey()} keyed>
        {(mount) => (
          <HostApiProvider
            sessionId={() => params().sessionId}
            grab={makePaneGrabApi(pane.grabStaging, pane.grabProvider)}
            attach={(file) => pane.attachments.enqueue(file)}
            newSession={newSession}
            viewLock={pane.setLockedFor(params().view)}
            viewLeave={() =>
              void router.navigate({to: '/panel/$sessionId', params: {sessionId: params().sessionId}, replace: true})
            }
          >
            <div
              {...viewTabPanelAttributes(mount.view.id)}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) pane.resetSlide()
              }}
              class={`flex flex-1 flex-col min-h-0 ${pane.slideClass()}`}
            >
              <div
                ref={setContent}
                role="group"
                aria-label={mount.view.label}
                tabindex={-1}
                class="flex flex-1 flex-col min-h-0 focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:-2px]"
              >
                <PluginBoundary name={mount.view.instance.extension.name} fallback="tab" focusAfterRetry={content}>
                  <MountedView view={mount.view} clientValue={mount.view.instance.clientValue} />
                </PluginBoundary>
              </div>
            </div>
          </HostApiProvider>
        )}
      </Show>
      <Show when={view() === undefined}>
        <PluginTabContent />
      </Show>
      <Outlet />
    </>
  )
}
