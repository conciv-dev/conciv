import {Match, Show, Switch, createResource, onCleanup, untrack, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {makeTimer} from '@solid-primitives/timer'
import {usePlugin} from '@conciv/plugin/experimental'
import {Recorder} from '../rpc.js'
import {REPLAY_MIN_EVENTS, type RrwebEvent} from '../shared/protocol.js'
import {saveFileToDisk} from './download.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {loadPlayerKit, mountStreamPlayer, type PlayerKit, type StreamPlayerHandle} from './player.js'

const VIEWER_RENEW_MS = 7000

const SavedRecording = z.object({recordingId: z.string()})

type ReplaySource = {events: RrwebEvent[]; cursor: number}

function recordingWithEnoughEvents(recording: ReplaySource | undefined): ReplaySource | undefined {
  if (!recording || recording.events.length < REPLAY_MIN_EVENTS) return undefined
  return recording
}

function base64Bytes(data: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
}

export function RecorderPanel(props: {clientId: string}): JSX.Element {
  const ctx = usePlugin()
  const recorder = () => ctx.client.rpc(Recorder)
  const viewerId = crypto.randomUUID()
  const [state, setState] = createStore({live: true, exporting: false, resetting: false})

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

  const [playerKit] = createResource(loadPlayerKit)
  const loadedPlayerKit = (): PlayerKit | undefined => (playerKit.state === 'ready' ? playerKit() : undefined)

  async function* follow(cursor: number, signal: AbortSignal): AsyncGenerator<ReplaySource> {
    const appended = recorder().events.subscribe('appended', {signal})[Symbol.asyncIterator]()
    let next = appended.next()
    let at = cursor
    const read = async (): Promise<ReplaySource> => {
      const fresh = await recorder().since({clientId: props.clientId, cursor: at}, {signal})
      at = fresh.cursor
      return fresh
    }
    try {
      yield await read()
      for (let step = await next; !step.done; step = await next) {
        next = appended.next()
        if (step.value.data.clientId === props.clientId) yield await read()
      }
    } finally {
      await appended.return?.()
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

  const exportFailed = (): void =>
    void ctx.toast.show({title: 'Could not export the recording. Try again.', variant: 'error'})

  const readVideo = async (id: string): Promise<File> => {
    const read = async (offset: number, parts: Uint8Array<ArrayBuffer>[]): Promise<File> => {
      const piece = await recorder()['recordings.exportVideo']({clientId: props.clientId, id, offset})
      const bytes = base64Bytes(piece.data)
      if (piece.eof) return new File([...parts, bytes], piece.name, {type: piece.mime})
      return read(offset + bytes.length, [...parts, bytes])
    }
    return read(0, [])
  }

  const downloadVideo = async (): Promise<void> => {
    setState('exporting', true)
    try {
      const saved = SavedRecording.safeParse(await recorder()['recordings.save']({clientId: props.clientId}))
      if (!saved.success) {
        exportFailed()
        return
      }
      saveFileToDisk(await readVideo(saved.data.recordingId))
    } catch {
      exportFailed()
    } finally {
      setState('exporting', false)
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
        <Match when={recording.error}>
          <RecorderErrorNotice retry={retry} />
        </Match>
        <Match when={recording.state === 'pending'}>
          <RecorderNotice text="Loading recording…" />
        </Match>
        <Match keyed when={recordingWithEnoughEvents(recording.latest)}>
          {(source) => (
            <>
              <Switch fallback={<RecorderNotice text="Loading player…" />}>
                <Match when={playerKit.error}>
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
                  disabled={state.resetting}
                  busy={state.resetting}
                  onClick={() => void startOver()}
                >
                  New recording
                </ctx.ui.Button>
                <ctx.ui.Button
                  variant="neutral"
                  size="small"
                  disabled={state.exporting}
                  busy={state.exporting}
                  onClick={() => void downloadVideo()}
                >
                  {state.exporting ? 'Exporting…' : 'Export video'}
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
