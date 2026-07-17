import {Show, createSignal, onCleanup, type JSX} from 'solid-js'
import {QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient} from '@tanstack/solid-query'
import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import {Button, Switch} from '@conciv/ui-kit-system'
import {RECORDER_NAME, type ActionLogEntry, type RrwebEvent} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {mountPlayer} from './player.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {useRecorderContext} from './recorder-context.js'

function recordingWithEnoughEvents(recording: {events: RrwebEvent[]} | undefined): RrwebEvent[] | undefined {
  const events = recording?.events ?? []
  return events.length >= 2 ? events : undefined
}

export function RecorderPanelView(): JSX.Element {
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <RecorderPanel />
    </QueryClientProvider>
  )
}

function RecorderPanel(): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const attach = host.useComposerAttach()
  const leaveView = host.useLeaveView()
  const toast = host.useToast()
  const store = useRecorderContext((context) => context.store)
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const utils = createTanstackQueryUtils(rpc)
  const queryClient = useQueryClient()
  const recording = useQuery(() => utils.window.queryOptions({input: {}}))
  const log = useQuery(() => utils.log.queryOptions({input: {}}))
  const reset = useMutation(() =>
    utils.reset.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
      onError: () => toast('Could not start a new recording — is the page still connected?'),
    }),
  )
  const [skipIdle, setSkipIdle] = createSignal(true)

  const retry = (): void => void queryClient.invalidateQueries()

  const replayRef = (events: RrwebEvent[]) => (container: HTMLDivElement) => {
    if (events.length < 2) return
    onCleanup(mountPlayer(container, events, skipIdle))
  }

  const sendToAgent = (): void => {
    const entries = log.data?.entries ?? []
    const lines = entries.map((entry: ActionLogEntry) => `[${entry.kind}] ${entry.detail}`)
    const actionLog = `Recorded user actions on the host page:\n${lines.join('\n')}`
    attach(new File([actionLog], 'recording.txt', {type: 'text/plain'}))
    leaveView()
  }

  return (
    <div class="p-3 flex flex-1 flex-col gap-3 min-h-0 overflow-hidden">
      <Show when={store.status() !== 'failed'} fallback={<RecorderFailedNotice />}>
        <Show when={!recording.isError && !log.isError} fallback={<RecorderErrorNotice retry={retry} />}>
          <Show when={!recording.isPending} fallback={<RecorderNotice text="Loading recording…" />}>
            <Show keyed when={recordingWithEnoughEvents(recording.data)} fallback={<RecorderEmptyNotice />}>
              {(events) => (
                <>
                  <div ref={replayRef(events)} class="flex flex-1 min-h-0 w-full items-start justify-center" />
                  <div class="flex gap-2 items-center">
                    <Button size="sm" disabled={!log.isSuccess} onClick={sendToAgent}>
                      Send to agent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reset.isPending}
                      onClick={() => reset.mutate(undefined)}
                    >
                      New recording
                    </Button>
                    <Switch.Root
                      class="ml-auto"
                      checked={skipIdle()}
                      onCheckedChange={(details) => setSkipIdle(details.checked)}
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Switch.Label>Skip idle</Switch.Label>
                      <Switch.HiddenInput />
                    </Switch.Root>
                  </div>
                </>
              )}
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  )
}

function RecorderFailedNotice(): JSX.Element {
  return <RecorderNotice text="Recording is unavailable — capture failed to start on this page." />
}

function RecorderEmptyNotice(): JSX.Element {
  return <RecorderNotice text="No recording yet — interact with the page first." />
}
