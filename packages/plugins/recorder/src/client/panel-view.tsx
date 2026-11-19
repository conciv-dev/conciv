import {Match, Show, Switch, onCleanup, untrack, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeTimer} from '@solid-primitives/timer'
import {useMutation, useQuery, useQueryClient} from '@conciv/client'
import {usePlugin} from '@conciv/plugin/experimental'
import {Page} from '@conciv/plugin/experimental/page'
import {Recorder} from '../rpc.js'
import {REPLAY_MIN_EVENTS} from '../protocol.js'
import type {CaptureState} from './boot.js'
import {saveFileToDisk} from './download.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {loadPlayerKit, mountStreamPlayer, type PlayerKit, type StreamPlayerHandle} from './player.js'
import {followRecording, readVideo, type ReplaySource} from './replay.js'

const VIEWER_RENEW_MS = 7000

function recordingWithEnoughEvents(recording: ReplaySource | undefined): ReplaySource | undefined {
  if (!recording || recording.events.length < REPLAY_MIN_EVENTS) return undefined
  return recording
}

export function RecorderPanel(props: {clientId: string; capture: CaptureState}): JSX.Element {
  const ctx = usePlugin()
  const queryClient = useQueryClient()
  const page = ctx.use(Page)
  const recorder = () => ctx.client.rpc(Recorder)
  const viewerId = crypto.randomUUID()
  const [state, setState] = createStore({live: true})
  const clientId = (): string => props.clientId
  const recordingKey = () => recorder().window.key({input: {clientId: props.clientId}})

  const presence = useMutation(() => ({
    ...recorder().presence.mutationOptions(),
    onError: (error: unknown) => console.error('[conciv] the recorder viewer lease could not be renewed', error),
  }))
  const announce = (live: boolean): Promise<void> =>
    presence.mutateAsync({viewerId, live}).then(
      () => undefined,
      () => undefined,
    )
  makeTimer(() => void announce(true), VIEWER_RENEW_MS, setInterval)
  onCleanup(() => void announce(false))

  const recording = useQuery(() => {
    const read = recorder().window.queryOptions({input: {clientId: props.clientId}})
    return {
      ...read,
      queryFn: async (context: {readonly signal: AbortSignal}) => {
        await announce(true)
        return read.queryFn(context)
      },
      retry: false,
      gcTime: 0,
      refetchOnWindowFocus: false,
    }
  })
  const retry = (): void => void recording.refetch()

  const stopWatching = recorder().events.on(
    'appended',
    (event) =>
      untrack(() => {
        if (event.data.clientId !== props.clientId || recordingWithEnoughEvents(recording.data)) return
        void queryClient.invalidateQueries({queryKey: recordingKey()})
      }),
    {signal: ctx.signal},
  )
  onCleanup(stopWatching)

  const playerKit = useQuery(() => ({
    queryKey: ['plugin', 'recorder', 'player-kit'],
    queryFn: loadPlayerKit,
    retry: false,
    refetchOnWindowFocus: false,
  }))
  const loadedPlayerKit = (): PlayerKit | undefined => (playerKit.isSuccess ? playerKit.data : undefined)

  let playerHandle: StreamPlayerHandle | undefined
  const replayRef = (kit: PlayerKit, source: ReplaySource) => (container: HTMLDivElement) => {
    if (source.events.length < 2) return
    const mounted = mountStreamPlayer(kit, container, source, {
      follow: async (cursor, signal) => followRecording(ctx.client, clientId, cursor, signal),
      onLive: (live) => setState('live', live),
    })
    playerHandle = mounted
    onCleanup(() => {
      mounted.dispose()
      if (playerHandle === mounted) playerHandle = undefined
    })
  }

  const save = useMutation(() => ({
    ...recorder()['recordings.save'].mutationOptions(),
    onSuccess: async (saved: unknown) => saveFileToDisk(await readVideo(ctx.client, props.clientId, saved)),
    onError: () => void ctx.toast.show({title: 'Could not export the recording. Try again.', variant: 'error'}),
  }))

  const reset = useMutation(() => ({
    ...recorder().reset.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({queryKey: recordingKey()}),
    onError: () =>
      void ctx.toast.show({title: 'Could not start a new recording. Is the page still connected?', variant: 'error'}),
  }))

  return (
    <div class="p-3 flex flex-1 flex-col gap-3 min-h-0 overflow-hidden">
      <Switch fallback={<RecorderEmptyNotice />}>
        <Match when={page().status === 'pending'}>
          <RecorderNotice text="Waiting for the page: nothing is recorded until it connects." />
        </Match>
        <Match when={page().status === 'inactive'}>
          <RecorderNotice text="Recording is off: the page plugin is not active, so nothing is recorded." />
        </Match>
        <Match when={props.capture.failed}>
          <RecorderNotice text="Recording is unavailable: capture failed to start on this page." />
        </Match>
        <Match when={recording.isError}>
          <RecorderErrorNotice retry={retry} />
        </Match>
        <Match when={recording.isPending}>
          <RecorderNotice text="Loading recording…" />
        </Match>
        <Match keyed when={recordingWithEnoughEvents(recording.data)}>
          {(source) => (
            <>
              <Switch fallback={<RecorderNotice text="Loading player…" />}>
                <Match when={playerKit.isError}>
                  <RecorderErrorNotice retry={() => location.reload()} text="Could not load the player." />
                </Match>
                <Match keyed when={loadedPlayerKit()}>
                  {(kit) => (
                    <div ref={replayRef(kit, source)} class="flex flex-1 min-h-0 w-full items-start justify-center" />
                  )}
                </Match>
              </Switch>
              <div class="flex gap-2 items-center">
                <ctx.ui.Button
                  variant="neutral"
                  size="small"
                  disabled={reset.isPending}
                  busy={reset.isPending}
                  onClick={() => reset.mutate(undefined)}
                >
                  New recording
                </ctx.ui.Button>
                <ctx.ui.Button
                  variant="neutral"
                  size="small"
                  disabled={save.isPending}
                  busy={save.isPending}
                  onClick={() => save.mutate({clientId: props.clientId})}
                >
                  {save.isPending ? 'Exporting…' : 'Export video'}
                </ctx.ui.Button>
                <div class="ml-auto flex gap-2 items-center">
                  <Show
                    when={state.live}
                    fallback={
                      <ctx.ui.Button variant="neutral" size="small" onClick={() => playerHandle?.goLive()}>
                        GO LIVE
                      </ctx.ui.Button>
                    }
                  >
                    <LiveBadge />
                  </Show>
                </div>
              </div>
            </>
          )}
        </Match>
      </Switch>
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
      <span class="text-chat-xs text-chat-text tracking-[0.1em] font-chat font-semibold">LIVE</span>
    </div>
  )
}

function RecorderEmptyNotice(): JSX.Element {
  return <RecorderNotice text="No recording yet: interact with the page first." />
}
