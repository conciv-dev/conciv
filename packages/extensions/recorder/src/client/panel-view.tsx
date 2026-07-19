import {Show, createResource, createSignal, onCleanup, type JSX} from 'solid-js'
import {QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient} from '@tanstack/solid-query'
import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
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
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const attach = host.useComposerAttach()
  const leaveView = host.useLeaveView()
  const toast = host.useToast()
  const store = useRecorderContext((context) => context.store)
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const utils = createTanstackQueryUtils(rpc)
  const queryClient = useQueryClient()
  const viewerId = crypto.randomUUID()
  const [presenceReady] = createResource(async () => {
    await rpc.presence({viewerId, live: true}).catch(() => {})
    return true
  })
  const renewTimer = setInterval(() => void rpc.presence({viewerId, live: true}).catch(() => {}), VIEWER_RENEW_MS)
  onCleanup(() => {
    clearInterval(renewTimer)
    void rpc.presence({viewerId, live: false}).catch(() => {})
  })
  const pinned = (): {clientId?: string} => {
    const clientId = store.clientId()
    return clientId ? {clientId} : {}
  }
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
      onError: () => toast('Could not start a new recording — is the page still connected?'),
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

  const downloadVideo = async (): Promise<void> => {
    const saved = await save.mutateAsync(pinned()).catch(() => null)
    if (!saved || 'error' in saved) {
      toast('Could not export the recording — try again.')
      return
    }
    const video = await exportVideo.mutateAsync({recordingId: saved.recordingId}).catch(() => null)
    if (!(video instanceof File)) {
      toast('Could not export the recording — try again.')
      return
    }
    saveFileToDisk(video)
  }

  const sendToAgent = async (): Promise<void> => {
    const saved = await save.mutateAsync(pinned()).catch(() => null)
    if (!saved || 'error' in saved) {
      toast('Could not save the recording — try again.')
      return
    }
    const fresh = await log.refetch().catch(() => null)
    const entries = fresh?.data?.entries ?? log.data?.entries ?? []
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
                          <button
                            type="button"
                            class="px-2.5 border border-pw-line rounded-pw-pill bg-pw-fill flex gap-1.5 h-6.5 cursor-pointer select-none items-center hover:border-pw-line-2 hover:bg-pw-fill-strong"
                            onClick={() => playerHandle?.goLive()}
                          >
                            <span class="rounded-full bg-pw-text-3 size-1.5" />
                            <span class="text-[0.6875rem] text-pw-text-2 tracking-[0.1em] font-pw font-semibold">
                              GO LIVE
                            </span>
                          </button>
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
    <div class="px-2.5 border border-pw-line rounded-pw-pill bg-pw-fill flex gap-1.5 h-6.5 select-none items-center">
      <span class="size-1.5 relative">
        <span class="rounded-full bg-pw-danger inset-0 absolute anim-fab-ring" />
        <span class="rounded-full bg-pw-danger inset-0 absolute" />
      </span>
      <span class="text-[0.6875rem] text-pw-text tracking-[0.1em] font-pw font-semibold">LIVE</span>
    </div>
  )
}

function RecorderFailedNotice(): JSX.Element {
  return <RecorderNotice text="Recording is unavailable — capture failed to start on this page." />
}

function RecorderEmptyNotice(): JSX.Element {
  return <RecorderNotice text="No recording yet — interact with the page first." />
}
