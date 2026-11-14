import {Show, createResource, createSignal, onCleanup, type JSX} from 'solid-js'
import {makeTimer} from '@solid-primitives/timer'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
  createTanstackQueryUtils,
} from '@conciv/client'
import {getExtensionApi, makeExtRpcClient} from '@conciv/extension'
import {Button} from '@conciv/ui-kit-system'
import {
  RECORDER_MIME,
  RECORDER_NAME,
  REPLAY_MIN_EVENTS,
  recordingPoster,
  recordingRefJson,
  type RrwebEvent,
} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {loadPlayerKit, mountStreamPlayer, type PlayerKit, type StreamPlayerHandle} from './player.js'
import {saveFileToDisk} from './download.js'
import {RecorderBlockedCardNotice, RecorderBlockedNotice, RecorderErrorNotice, RecorderNotice} from './notices.js'
import {useRecorderContext} from './recorder-context.js'

const VIEWER_RENEW_MS = 7000

type ReplaySource = {events: RrwebEvent[]; cursor: number}

function recordingWithEnoughEvents(recording: ReplaySource | undefined): ReplaySource | undefined {
  if (!recording || recording.events.length < REPLAY_MIN_EVENTS) return undefined
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
  const presence = (live: boolean): Promise<void> =>
    rpc.presence({viewerId, live}).then(
      () => undefined,
      (error: unknown) => console.error('[conciv] the recorder viewer lease could not be renewed', error),
    )
  const [presenceReady] = createResource(async () => {
    await presence(true)
    return true
  })
  makeTimer(() => void presence(true), VIEWER_RENEW_MS, setInterval)
  onCleanup(() => void presence(false))
  const pinned = (): {clientId: string} => ({clientId: store.clientId()})
  const recording = useQuery(() => ({
    ...utils.replay.experimental_liveOptions({input: pinned()}),
    enabled: presenceReady() === true,
    refetchOnWindowFocus: false,
  }))
  const log = useQuery(() => ({
    ...utils.log.queryOptions({input: pinned()}),
    refetchOnWindowFocus: false,
  }))
  const reset = useMutation(() =>
    utils.reset.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries(),
      onError: () => toast('Could not start a new recording. Is the page still connected?'),
    }),
  )
  const retry = (): void => void queryClient.invalidateQueries()

  const [playerKit] = createResource(loadPlayerKit)
  const loadedPlayerKit = (): PlayerKit | undefined => (playerKit.state === 'ready' ? playerKit() : undefined)
  const blocked = (): boolean => store.status() === 'blocked'

  const [live, setLive] = createSignal(true)
  let playerHandle: StreamPlayerHandle | undefined
  const replayRef = (kit: PlayerKit, source: ReplaySource) => (container: HTMLDivElement) => {
    if (source.events.length < 2) return
    const mounted = mountStreamPlayer(kit, container, source, {
      follow: (cursor, signal) =>
        rpc.events({cursor, ...pinned()}, {signal, context: {retry: Number.POSITIVE_INFINITY}}),
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
      <Show when={!blocked()} fallback={<RecorderBlockedNotice />}>
        <Show when={store.status() !== 'failed'} fallback={<RecorderFailedNotice />}>
          <Show when={!recording.isError && !log.isError} fallback={<RecorderErrorNotice retry={retry} />}>
            <Show when={!recording.isPending} fallback={<RecorderNotice text="Loading recording…" />}>
              <Show keyed when={recordingWithEnoughEvents(recording.data)} fallback={<RecorderEmptyNotice />}>
                {(source) => (
                  <>
                    <Show
                      keyed
                      when={loadedPlayerKit()}
                      fallback={
                        <Show when={playerKit.state === 'errored'} fallback={<RecorderNotice text="Loading player…" />}>
                          <RecorderBlockedCardNotice />
                        </Show>
                      }
                    >
                      {(kit) => (
                        <div
                          ref={replayRef(kit, source)}
                          class="flex flex-1 min-h-0 w-full items-start justify-center"
                        />
                      )}
                    </Show>
                    <div class="flex gap-2 items-center">
                      <Button size="xs" disabled={!log.isSuccess} onClick={() => void sendToAgent()}>
                        Send to agent
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={reset.isPending}
                        onClick={() => reset.mutate(undefined)}
                      >
                        New recording
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
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
