import {createFileRoute} from '@tanstack/solid-router'
import {Show, createSignal, onCleanup, onMount, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {Portal} from 'solid-js/web'
import {Button, EnvironmentProvider} from '@conciv/ui-kit-system'
import {useConnectionGeneration, useHostTheme, useSettings} from '../app/context.js'
import {PaneProvider} from '../app/pane-provider.js'
import {ChatPane} from '../pane/chat-pane.js'
import {RefreshButton} from '../shell/refresh-button.js'
import {openPipWindow, type PipWindow} from '../shell/pip.js'
import {NoticeContextProvider, NoticeSurface} from '../shell/notice-context.js'
import {EngineStaleNotice, EngineUnreachableNotice} from '../shell/engine-notice.js'

const PIP_ACTION = 'text-chat-text-2 leading-none size-8 hover:text-chat-text hover:bg-chat-fill-strong'
const POPPED_OUT =
  'fixed inset-0 pointer-events-auto flex flex-col items-center justify-center gap-3 p-6 text-center [background:var(--chat-bg)] text-chat-text font-chat text-[0.875rem] leading-[1.45]'

export const Route = createFileRoute('/pip/$sessionId')({component: PipSession})

function PipSession(): JSX.Element {
  const params = Route.useParams()
  const navigate = Route.useNavigate()
  const settings = useSettings()
  const generation = useConnectionGeneration()
  const theme = useHostTheme()
  const [pip, setPip] = createSignal<PipWindow | null>(null)
  const paneKey = () => {
    const sessionId = params().sessionId
    return sessionId ? {sessionId, generation: generation()} : undefined
  }
  const returnInline = (search: {popOut?: 'lost'}) =>
    void navigate({to: '/panel/$sessionId', params: {sessionId: params().sessionId}, search, replace: true})

  onMount(() => {
    const opened = openPipWindow({title: 'conciv', theme})
    if (!opened) {
      returnInline({popOut: 'lost'})
      return
    }
    makeEventListener(opened.win, 'pagehide', () => {
      setPip(null)
      returnInline({})
    })
    setPip(opened)
  })
  onCleanup(() => pip()?.close())

  return (
    <>
      <Show when={settings.surface === 'dock' && pip()}>
        <section class={POPPED_OUT} aria-label="conciv chat agent">
          <p class="font-semibold">Chat is popped out</p>
          <Button variant="outline" class="min-h-11" onClick={() => returnInline({})}>
            Bring it back
          </Button>
        </section>
      </Show>
      <Show when={pip()} keyed>
        {(target) => (
          <Portal mount={target.wrap}>
            <EnvironmentProvider value={() => target.root}>
              <NoticeContextProvider>
                <Show when={paneKey()} keyed>
                  {(key) => (
                    <PaneProvider sessionId={key.sessionId}>
                      <div class="flex flex-col h-full min-h-0 bg-chat-panel text-chat-text font-chat text-[0.875rem] leading-[1.45]">
                        <NoticeSurface />
                        <EngineStaleNotice />
                        <EngineUnreachableNotice />
                        <div class="flex justify-end px-2 pt-1">
                          <RefreshButton class={PIP_ACTION} />
                        </div>
                        <ChatPane sessionId={key.sessionId} />
                      </div>
                    </PaneProvider>
                  )}
                </Show>
              </NoticeContextProvider>
            </EnvironmentProvider>
          </Portal>
        )}
      </Show>
    </>
  )
}
