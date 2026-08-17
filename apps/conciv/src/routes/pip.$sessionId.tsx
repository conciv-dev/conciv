import {createFileRoute, useRouter} from '@tanstack/solid-router'
import {Show, createSignal, onCleanup, onMount, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {Portal} from 'solid-js/web'
import {EnvironmentProvider} from '@conciv/ui-kit-system'
import {useConnectionGeneration} from '../app/context.js'
import {PaneProvider} from '../app/pane-provider.js'
import {ChatPane} from '../pane/chat-pane.js'
import {RefreshButton} from '../shell/refresh-button.js'
import {openPipWindow, type PipWindow} from '../shell/pip.js'
import {NoticeContextProvider, NoticeSurface} from '../shell/notice-context.js'
import {EngineStaleNotice, EngineUnreachableNotice} from '../shell/engine-notice.js'

const PIP_ACTION = 'text-pw-text-2 leading-none size-8 hover:text-pw-text hover:bg-pw-fill-strong'

export const Route = createFileRoute('/pip/$sessionId')({component: PipSession})

function PipSession(): JSX.Element {
  const params = Route.useParams()
  const router = useRouter()
  const generation = useConnectionGeneration()
  const [pip, setPip] = createSignal<PipWindow | null>(null)
  const paneKey = () => {
    const sessionId = params().sessionId
    return sessionId ? {sessionId, generation: generation()} : undefined
  }

  onMount(() => {
    const opened = openPipWindow({title: 'conciv'})
    if (!opened) {
      router.history.back()
      return
    }
    makeEventListener(opened.win, 'pagehide', () => {
      setPip(null)
      router.history.back()
    })
    setPip(opened)
  })
  onCleanup(() => pip()?.close())

  return (
    <Show when={pip()} keyed>
      {(target) => (
        <Portal mount={target.wrap}>
          <EnvironmentProvider value={() => target.root}>
            <NoticeContextProvider>
              <Show when={paneKey()} keyed>
                {(key) => (
                  <PaneProvider sessionId={key.sessionId}>
                    <div class="flex flex-col h-full min-h-0 bg-pw-panel text-pw-text font-pw text-[0.875rem] leading-[1.45]">
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
  )
}
