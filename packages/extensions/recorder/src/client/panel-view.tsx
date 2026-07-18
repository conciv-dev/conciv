import {Show, createResource, onCleanup, type JSX} from 'solid-js'
import {QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient} from '@tanstack/solid-query'
import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import {Button} from '@conciv/ui-kit-system'
import {RECORDER_MIME, RECORDER_NAME, recordingPoster, recordingRefJson, type RrwebEvent} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {mountLivePlayer} from './player.js'
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
  const [presenceReady] = createResource(async () => {
    await rpc.presence({live: true}).catch(() => {})
    return true
  })
  onCleanup(() => void rpc.presence({live: false}).catch(() => {}))
  const pinned = (): {clientId?: string} => {
    const clientId = store.clientId()
    return clientId ? {clientId} : {}
  }
  const hasReplay = (data: {events: RrwebEvent[]} | undefined): boolean => (data?.events?.length ?? 0) >= 2
  const recording = useQuery(() => ({
    ...utils.window.queryOptions({input: pinned()}),
    enabled: presenceReady() === true,
    refetchInterval: (query: {state: {data?: {events: RrwebEvent[]}}}) =>
      hasReplay(query.state.data) ? false : 1000,
  }))
  const log = useQuery(() => ({
    ...utils.log.queryOptions({input: pinned()}),
    refetchInterval: (query: {state: {data?: {entries: unknown[]}}}) =>
      (query.state.data?.entries?.length ?? 0) > 0 ? false : 1000,
  }))
  const reset = useMutation(() =>
    utils.reset.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
      onError: () => toast('Could not start a new recording — is the page still connected?'),
    }),
  )
  const retry = (): void => void queryClient.invalidateQueries()

  const replayRef = (events: RrwebEvent[]) => (container: HTMLDivElement) => {
    if (events.length < 2) return
    onCleanup(
      mountLivePlayer(container, events, (sinceTs) => rpc.events({sinceTs, ...pinned()}).then((delta) => delta.events)),
    )
  }

  const save = useMutation(() => utils.recordings.save.mutationOptions())

  const sendToAgent = async (): Promise<void> => {
    const entries = log.data?.entries ?? []
    const saved = await save.mutateAsync(pinned()).catch(() => null)
    if (!saved || 'error' in saved) {
      toast('Could not save the recording — try again.')
      return
    }
    const ref = recordingRefJson({recordingId: saved.recordingId, poster: recordingPoster(entries)})
    attach(new File([ref], 'Screen recording', {type: RECORDER_MIME}))
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
                    <Button size="sm" disabled={!log.isSuccess} onClick={() => void sendToAgent()}>
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
                    <div class="ml-auto">
                      <RecorderNotice text="Live" />
                    </div>
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
