import {Match, Show, Switch, untrack, type JSX} from 'solid-js'
import {Effect, Stream, SubscriptionRef} from 'effect'
import {useMutation, useQuery, useQueryClient} from '@conciv/client'
import {usePlugin, type PanelProps} from '@conciv/plugin/experimental'
import {Page} from '@conciv/plugin/experimental/page'
import {REPLAY_MIN_EVENTS, Recorder} from './rpc.js'
import {saveFileToDisk, videoPieceReader} from './download.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {followClient} from './page-capture.js'
import {openPanel, recorderPanelCalls} from './panel.js'
import {followEvents, type ReplaySource} from './player-follow.js'
import {streamPlayer, type PlayerKit} from './player.js'
import {PlayerKitSwitch, usePlayerKit} from './player-kit.js'
import {runInOwnerScope, follow, type RecorderRuntime} from './solid-runtime.js'

function recordingWithEnoughEvents(recording: ReplaySource | undefined): ReplaySource | undefined {
  if (!recording || recording.events.length < REPLAY_MIN_EVENTS) return undefined
  return recording
}

export function RecorderPanel(props: {
  clientId: string
  runtime: RecorderRuntime
  captureFailed: () => boolean
  flushNow: Effect.Effect<void>
  host: PanelProps
}): JSX.Element {
  const ctx = usePlugin()
  const page = ctx.use(Page)
  const recorder = () => ctx.client.rpc(Recorder)
  const viewerId = crypto.randomUUID()
  const runtime = untrack(() => props.runtime)
  const followedClientId = untrack(() => props.clientId)
  const flushNow = untrack(() => props.flushNow)
  const queryClient = useQueryClient()
  const recordingKey = () => recorder().window.key({input: {clientId: props.clientId}})
  const refresh = (): Promise<void> => queryClient.invalidateQueries({queryKey: recordingKey()})
  const save = useMutation(() => recorder()['recordings.save'].mutationOptions())
  const reset = useMutation(() => recorder().reset.mutationOptions())
  const exportPiece = useMutation(() => recorder()['recordings.exportVideo'].mutationOptions())

  const panel = runInOwnerScope(
    runtime,
    openPanel({
      ...recorderPanelCalls({
        client: () => ctx.client,
        save: save.mutateAsync,
        reset: () => reset.mutateAsync(undefined),
        clientId: followedClientId,
        viewerId,
        refresh,
        flush: flushNow,
        readPiece: videoPieceReader(exportPiece.mutateAsync),
        saveFile: (file) => Effect.sync(() => saveFileToDisk(file)),
        noteSaved: ({recordingId, summary}) => {
          props.host.screen.composer.attach({
            type: 'note',
            origin: ctx.id,
            commentId: crypto.randomUUID(),
            label: 'Screen recording',
            subtitle: summary,
            icon: 'clapperboard',
            subject: `the screen recording ${recordingId} (Screen recording · ${summary})`,
            href: recordingId,
            comment: '',
          })
          ctx.layout.hide(`${ctx.id}:${props.host.tab.id}`, props.host.session)
        },
      }),
      report: (title) => Effect.sync(() => void ctx.toast.show({title, variant: 'error'})),
    }),
  )
  const panelState = follow(runtime, panel.state)
  const live = follow(runtime, panel.live)
  const run = (effect: Effect.Effect<void>): void => void runtime.runFork(effect)

  const recording = useQuery(() => ({
    ...recorder().window.queryOptions({input: {clientId: props.clientId}}),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  }))
  const retry = (): void => void recording.refetch()

  runInOwnerScope(
    runtime,
    followEvents(recorder().events.subscribe('appended')).pipe(
      Stream.runForEach((event) =>
        untrack(() => {
          if (event.data.clientId !== props.clientId || recordingWithEnoughEvents(recording.data)) return Effect.void
          return Effect.promise(refresh)
        }),
      ),
      Effect.ignore,
      Effect.forkScoped,
    ),
  )

  const playerKit = usePlayerKit()

  const followFrom = followClient(ctx, followedClientId)

  const replayRef = (kit: PlayerKit, source: ReplaySource) => (container: HTMLDivElement) => {
    if (source.events.length < 2) return
    runInOwnerScope(
      runtime,
      streamPlayer(kit, container, source, {
        follow: followFrom,
        goLiveRequests: panel.goLiveRequests,
        onLive: (current) => runtime.runSync(SubscriptionRef.set(panel.live, current)),
      }),
    )
  }

  return (
    <div class="p-3 flex flex-1 flex-col gap-3 min-h-0 overflow-hidden">
      <Switch fallback={<RecorderEmptyNotice />}>
        <Match when={page().status === 'pending'}>
          <RecorderNotice text="Waiting for the page: nothing is recorded until it connects." />
        </Match>
        <Match when={page().status === 'inactive'}>
          <RecorderNotice text="Recording is off: the page plugin is not active, so nothing is recorded." />
        </Match>
        <Match when={props.captureFailed()}>
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
              <PlayerKitSwitch kit={playerKit}>
                {(kit) => (
                  <div ref={replayRef(kit, source)} class="flex flex-1 min-h-0 w-full items-start justify-center" />
                )}
              </PlayerKitSwitch>
              <div class="flex gap-2 items-center">
                <ctx.ui.Button
                  variant="contrast"
                  size="small"
                  disabled={panelState().status !== 'idle'}
                  busy={panelState().status === 'sending'}
                  onClick={() => run(panel.requestSend)}
                >
                  Send to agent
                </ctx.ui.Button>
                <ctx.ui.Button
                  variant="neutral"
                  size="small"
                  disabled={panelState().status !== 'idle'}
                  busy={panelState().status === 'resetting'}
                  onClick={() => run(panel.requestReset)}
                >
                  New recording
                </ctx.ui.Button>
                <ctx.ui.Button
                  variant="neutral"
                  size="small"
                  disabled={panelState().status !== 'idle'}
                  busy={panelState().status === 'exporting'}
                  onClick={() => run(panel.requestExport)}
                >
                  {panelState().status === 'exporting' ? 'Exporting…' : 'Export video'}
                </ctx.ui.Button>
                <div class="ml-auto flex gap-2 items-center">
                  <Show
                    when={live()}
                    fallback={
                      <ctx.ui.Button variant="neutral" size="small" onClick={() => run(panel.requestGoLive)}>
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
