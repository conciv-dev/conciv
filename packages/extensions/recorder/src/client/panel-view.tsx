import {Show, createResource, createSignal, onCleanup, type JSX} from 'solid-js'
import {makeTimer} from '@solid-primitives/timer'
import {QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient} from '@tanstack/solid-query'
import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {getExtensionApi, makeExtRpcClient} from '@conciv/extension'
import {Button} from '@conciv/ui-kit-system'
import {RECORDER_MIME, RECORDER_NAME, recordingPoster, recordingRefJson, type RrwebEvent} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {mountStreamPlayer, type StreamPlayerHandle} from './player.js'
import {saveFileToDisk} from './download.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {useRecorderContext} from './recorder-context.js'

const VIEWER_RENEW_MS = 7000

type ReplaySource = {events: RrwebEvent[]; cursor: number}

function recordingWithEnoughEvents(recording: ReplaySource | undefined): ReplaySource | undefined {
  if (!recording || recording.events.length < 2) return undefined
  return recording
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
  const host = getExtensionApi(RECORDER_NAME)
  const apiBase = host.useApiBase()
  const attach = host.useComposerAttach()
  const leaveView = host.useLeaveView()
  const toast = host.useToast()
  const store = useRecorderContext((context) => context.store)
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase(), RECORDER_NAME)
  const utils = createTanstackQueryUtils(rpc)
  const queryClient = useQueryClient()
  const viewerId = crypto.randomUUID()
  const [presenceReady] = createResource(async () => {
    await rpc.presence({viewerId, live: true}).catch(() => {})
    return true
  })
  makeTimer(() => void rpc.presence({viewerId, live: true}).catch(() => {}), VIEWER_RENEW_MS, setInterval)
  onCleanup(() => void rpc.presence({viewerId, live: false}).catch(() => {}))
  const pinned = (): {clientId: string} => ({clientId: store.clientId()})
  const hasReplay = (data: {events: RrwebEvent[]} | undefined): boolean => (data?.events?.length ?? 0) >= 2
  const recording = useQuery(() => ({
    ...utils.window.queryOptions({input: pinned()}),
    enabled: presenceReady() === true,
    refetchOnWindowFocus: false,
    refetchInterval: (query: {state: {data?: {events: RrwebEvent[]}}}) => (hasReplay(query.state.data) ? false : 1000),
  }))
  const log = useQuery(() => ({
    ...utils.log.queryOptions({input: pinned()}),
    refetchOnWindowFocus: false,
    refetchInterval: (query: {state: {data?: {entries: unknown[]}}}) =>
      (query.state.data?.entries?.length ?? 0) > 0 ? false : 1000,
  }))
  const reset = useMutation(() =>
    utils.reset.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
      onError: () => toast('Could not start a new recording. Is the page still connected?'),
    }),
  )
  const retry = (): void => void queryClient.invalidateQueries()

  const [live, setLive] = createSignal(true)
  let playerHandle: StreamPlayerHandle | undefined
  const replayRef = (source: ReplaySource) => (container: HTMLDivElement) => {
    if (source.events.length < 2) return
    const mounted = mountStreamPlayer(container, source, {
      pull: (cursor) => rpc.events({cursor, ...pinned()}),
      onLive: setLive,
    })
    playerHandle = mounted
    onCleanup(() => {
      mounted.dispose()
      if (playerHandle === mounted) playerHandle = undefined
    })
  }

  const save = useMutation(() => utils.recordings.save.mutationOptions())
  const exportVideo = useMutation(() => utils.recordings.exportVideo.mutationOptions())

  const savedRecordingId = async (): Promise<string | null> => {
    const saved = await save.mutateAsync(pinned()).catch(() => null)
    if (!saved) return null
    if ('error' in saved) return null
    return saved.recordingId
  }

  const refetchedLogEntries = async () => {
    const fresh = await log.refetch().catch(() => null)
    return fresh?.data?.entries
  }

  const currentLogEntries = () => log.data?.entries ?? []

  const posterLogEntries = async () => (await refetchedLogEntries()) ?? currentLogEntries()

  const downloadVideo = async (): Promise<void> => {
    const recordingId = await savedRecordingId()
    if (!recordingId) {
      toast('Could not export the recording. Try again.')
      return
    }
    const video = await exportVideo.mutateAsync({recordingId}).catch(() => null)
    if (!(video instanceof File)) {
      toast('Could not export the recording. Try again.')
      return
    }
    saveFileToDisk(video)
  }

  const sendToAgent = async (): Promise<void> => {
    const recordingId = await savedRecordingId()
    if (!recordingId) {
      toast('Could not save the recording. Try again.')
      return
    }
    const ref = recordingRefJson({recordingId, poster: recordingPoster(await posterLogEntries())})
    attach(new File([ref], 'Screen recording', {type: RECORDER_MIME}))
    leaveView()
  }

  return (
    <div class="p-3 flex flex-1 flex-col gap-3 min-h-0 overflow-hidden">
      <Show when={store.status() !== 'failed'} fallback={<RecorderFailedNotice />}>
        <Show when={!recording.isError && !log.isError} fallback={<RecorderErrorNotice retry={retry} />}>
          <Show when={!recording.isPending} fallback={<RecorderNotice text="Loading recording…" />}>
            <Show keyed when={recordingWithEnoughEvents(recording.data)} fallback={<RecorderEmptyNotice />}>
              {(source) => (
                <>
                  <div ref={replayRef(source)} class="flex flex-1 min-h-0 w-full items-start justify-center" />
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={exportVideo.isPending || save.isPending}
                      onClick={() => void downloadVideo()}
                    >
                      {exportVideo.isPending ? 'Exporting…' : 'Export video'}
                    </Button>
                    <div class="ml-auto flex gap-2 items-center">
                      <Show
                        when={live()}
                        fallback={
                          <Button
                            variant="outline"
                            class="px-2.5 rounded-chat-pill h-6.5 select-none"
                            onClick={() => playerHandle?.goLive()}
                          >
                            <span class="rounded-full bg-chat-text-3 size-1.5" aria-hidden="true" />
                            <span class="text-[0.6875rem] text-chat-text-2 tracking-[0.1em] font-chat font-semibold">
                              GO LIVE
                            </span>
                          </Button>
                        }
                      >
                        <LiveBadge />
                      </Show>
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

function LiveBadge(): JSX.Element {
  return (
    <div class="px-2.5 border border-chat-line rounded-chat-pill bg-chat-fill flex gap-1.5 h-6.5 select-none items-center">
      <span class="size-1.5 relative">
        <span class="rounded-full bg-chat-danger inset-0 absolute anim-fab-ring" />
        <span class="rounded-full bg-chat-danger inset-0 absolute" />
      </span>
      <span class="text-[0.6875rem] text-chat-text tracking-[0.1em] font-chat font-semibold">LIVE</span>
    </div>
  )
}

function RecorderFailedNotice(): JSX.Element {
  return <RecorderNotice text="Recording is unavailable: capture failed to start on this page." />
}

function RecorderEmptyNotice(): JSX.Element {
  return <RecorderNotice text="No recording yet: interact with the page first." />
}
