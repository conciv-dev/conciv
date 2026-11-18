import {Match, Show, Switch, createResource, onCleanup, untrack, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {makeTimer} from '@solid-primitives/timer'
import {usePlugin, type PanelProps} from '@conciv/plugin/experimental'
import {Page} from '@conciv/plugin/experimental/page'
import {Recorder} from '../rpc.js'
import {REPLAY_MIN_EVENTS, type RrwebEvent} from '../protocol.js'
import type {CaptureState} from './boot.js'
import {ExportVideoButton} from './export-video-button.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {mountStreamPlayer, type PlayerKit, type StreamPlayerHandle} from './player.js'
import {PlayerKitSwitch, usePlayerKit} from './player-kit.js'

const VIEWER_RENEW_MS = 7000

const SAVE_FAILURES = {
  empty: 'Nothing to save yet: interact with the page first.',
  'too-large': 'The recording is too large to save. Start a new recording.',
  'io-error': 'Could not write the recording to the project folder. Try again.',
}

const AppendedHere = z.object({clientId: z.string()})

const APPENDED_EVENT = 'rpc.recorder.appended'

type ReplaySource = {events: RrwebEvent[]; cursor: number}

function recordingWithEnoughEvents(recording: ReplaySource | undefined): ReplaySource | undefined {
  if (!recording || recording.events.length < REPLAY_MIN_EVENTS) return undefined
  return recording
}

export function RecorderPanel(props: {clientId: string; capture: CaptureState; panel: PanelProps}): JSX.Element {
  const ctx = usePlugin()
  const page = ctx.use(Page)
  const recorder = () => ctx.client.rpc(Recorder)
  const viewerId = crypto.randomUUID()
  const [state, setState] = createStore({live: true, resetting: false, sending: false})

  const presence = (live: boolean): Promise<void> =>
    recorder()
      .presence({viewerId, live})
      .then(
        () => undefined,
        (error: unknown) => console.error('[conciv] the recorder viewer lease could not be renewed', error),
      )
  makeTimer(() => void presence(true), VIEWER_RENEW_MS, setInterval)
  onCleanup(() => void presence(false))

  const [recording, {refetch}] = createResource(
    () => props.clientId,
    async (clientId) => {
      await presence(true)
      return recorder().window({clientId}, {signal: ctx.signal})
    },
  )
  const retry = (): void => void refetch()

  const stopWatching = recorder().events.on(
    'appended',
    (event) =>
      untrack(() => {
        if (event.data.clientId !== props.clientId || recordingWithEnoughEvents(recording.latest)) return
        void refetch()
      }),
    {signal: ctx.signal},
  )
  onCleanup(stopWatching)

  const playerKit = usePlayerKit()

  const readSince = (cursor: number, signal: AbortSignal): Promise<ReplaySource | undefined> =>
    recorder()
      .since({clientId: props.clientId, cursor}, {signal})
      .then(
        (fresh): ReplaySource | undefined => fresh,
        (error: unknown) => {
          if (!signal.aborted) console.error('[conciv] the recorder replay could not read new events', error)
          return undefined
        },
      )

  const cuesRead = (event: {type: string; data?: unknown}): boolean =>
    event.type === 'server.connected' || AppendedHere.safeParse(event.data).data?.clientId === props.clientId

  async function* follow(cursor: number, signal: AbortSignal): AsyncGenerator<ReplaySource> {
    let at = cursor
    for await (const event of ctx.client.event.subscribe({types: [APPENDED_EVENT], signal})) {
      if (!cuesRead(event)) continue
      const fresh = await readSince(at, signal)
      if (!fresh) continue
      at = fresh.cursor
      yield fresh
    }
  }

  let playerHandle: StreamPlayerHandle | undefined
  const replayRef = (kit: PlayerKit, source: ReplaySource) => (container: HTMLDivElement) => {
    if (source.events.length < 2) return
    const mounted = mountStreamPlayer(kit, container, source, {
      follow: async (cursor, signal) => follow(cursor, signal),
      onLive: (live) => setState('live', live),
    })
    playerHandle = mounted
    onCleanup(() => {
      mounted.dispose()
      if (playerHandle === mounted) playerHandle = undefined
    })
  }

  const sendFailed = (): void =>
    void ctx.toast.show({title: 'Could not save the recording. Try again.', variant: 'error'})

  const saveFailed = (failure: keyof typeof SAVE_FAILURES): void =>
    void ctx.toast.show({title: SAVE_FAILURES[failure], variant: 'error'})

  const save = async () => {
    await props.capture.flushNow()
    return recorder()['recordings.save']({clientId: props.clientId})
  }

  const saveForExport = async (): Promise<string | undefined> => {
    const stored = await save()
    if (stored.saved) return stored.recordingId
    saveFailed(stored.error)
    return undefined
  }

  const sendToAgent = async (): Promise<void> => {
    setState('sending', true)
    try {
      const stored = await save()
      if (!stored.saved) {
        saveFailed(stored.error)
        return
      }
      const {recordingId, summary} = stored
      props.panel.screen.composer.attach({
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
      ctx.layout.hide(`${ctx.id}:${props.panel.tab.id}`, props.panel.session)
    } catch {
      sendFailed()
    } finally {
      setState('sending', false)
    }
  }

  const startOver = async (): Promise<void> => {
    setState('resetting', true)
    try {
      await recorder().reset(undefined)
      await refetch()
    } catch {
      ctx.toast.show({title: 'Could not start a new recording. Is the page still connected?', variant: 'error'})
    } finally {
      setState('resetting', false)
    }
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
        <Match when={props.capture.failed}>
          <RecorderNotice text="Recording is unavailable: capture failed to start on this page." />
        </Match>
        <Match when={recording.error}>
          <RecorderErrorNotice retry={retry} />
        </Match>
        <Match when={recording.state === 'pending'}>
          <RecorderNotice text="Loading recording…" />
        </Match>
        <Match keyed when={recordingWithEnoughEvents(recording.latest)}>
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
                  disabled={state.sending}
                  busy={state.sending}
                  onClick={() => void sendToAgent()}
                >
                  Send to agent
                </ctx.ui.Button>
                <ctx.ui.Button
                  variant="neutral"
                  size="small"
                  disabled={state.resetting}
                  busy={state.resetting}
                  onClick={() => void startOver()}
                >
                  New recording
                </ctx.ui.Button>
                <ExportVideoButton clientId={props.clientId} recordingId={saveForExport} />
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
