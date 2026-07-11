import {createFileRoute, useRouter} from '@tanstack/solid-router'
import {Show, createSignal, onCleanup, onMount, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {EnvironmentProvider} from '@conciv/ui-kit-system'
import {PaneProvider} from '../app/pane-provider.js'
import {ChatPane} from '../chat/chat-pane.js'
import {openPipWindow, type PipWindow} from '../shell/pip.js'

export const Route = createFileRoute('/pip/$sessionId')({component: PipSession})

function PipSession(): JSX.Element {
  const params = Route.useParams()
  const router = useRouter()
  const [pip, setPip] = createSignal<PipWindow | null>(null)

  onMount(() => {
    const opened = openPipWindow({title: 'conciv'})
    if (!opened) {
      router.history.back()
      return
    }
    opened.win.addEventListener('pagehide', () => {
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
            <Show when={params().sessionId} keyed>
              {(sessionId) => (
                <PaneProvider sessionId={sessionId}>
                  <div class="flex flex-col h-full min-h-0 bg-pw-glass text-pw-text font-pw text-[0.875rem] leading-[1.45]">
                    <ChatPane sessionId={sessionId} />
                  </div>
                </PaneProvider>
              )}
            </Show>
          </EnvironmentProvider>
        </Portal>
      )}
    </Show>
  )
}
