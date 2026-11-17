import {Match, Show, Switch, createMemo, createResource, onCleanup, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {usePlugin, type NoteCardProps} from '@conciv/plugin/experimental'
import {Recorder} from '../rpc.js'
import {REPLAY_MIN_EVENTS, RrwebEventSchema, type RrwebEvent} from '../protocol.js'
import {readRecordingVideo, saveFileToDisk} from './download.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {loadPlayerKit, mountPlayer, type PlayerKit} from './player.js'

const SavedEvents = z.object({events: z.array(RrwebEventSchema)})

type RecordingNote = {readonly recordingId: string; readonly poster: string}

export function RecordingCard(props: NoteCardProps & {clientId: string}): JSX.Element {
  const ctx = usePlugin()
  const poster = (): string => props.note.subtitle ?? props.note.label
  const play = (recordingId: string): void =>
    void ctx.dialogs.open(() => (
      <RecordingReplay recording={{recordingId, poster: poster()}} clientId={props.clientId} />
    ))

  return (
    <div class="flex gap-2 min-w-0 items-center">
      <ctx.ui.Icon name="clapperboard" size="small" class="text-chat-text-3 shrink-0" />
      <span class="text-chat-sm text-chat-text-hi font-chat min-w-0 truncate">{poster()}</span>
      <Show when={props.note.href}>
        {(recordingId) => (
          <ctx.ui.Button variant="neutral" size="small" onClick={() => play(recordingId())}>
            Play
          </ctx.ui.Button>
        )}
      </Show>
    </div>
  )
}

function RecordingReplay(props: {recording: RecordingNote; clientId: string}): JSX.Element {
  const ctx = usePlugin()
  const [state, setState] = createStore({exporting: false})
  const [saved, {refetch}] = createResource(
    () => props.recording.recordingId,
    (recordingId) => ctx.client.rpc(Recorder)['recordings.get']({recordingId}, {signal: ctx.signal}),
  )
  const events = createMemo((): RrwebEvent[] | undefined =>
    saved.state === 'ready' ? SavedEvents.safeParse(saved()).data?.events : undefined,
  )
  const [playerKit] = createResource(loadPlayerKit)
  const loadedPlayerKit = (): PlayerKit | undefined => (playerKit.state === 'ready' ? playerKit() : undefined)
  const replayRef = (kit: PlayerKit, playable: RrwebEvent[]) => (container: HTMLDivElement) => {
    onCleanup(mountPlayer(kit, container, playable))
  }

  const exportVideo = async (): Promise<void> => {
    setState('exporting', true)
    try {
      saveFileToDisk(await readRecordingVideo(ctx, props.clientId, props.recording.recordingId))
    } catch {
      ctx.toast.show({title: 'Could not export the recording. Try again.', variant: 'error'})
    } finally {
      setState('exporting', false)
    }
  }

  return (
    <ctx.ui.Dialog
      title="Screen recording replay"
      description={props.recording.poster}
      size="x-large"
      footer={
        <ctx.ui.Button
          variant="neutral"
          size="small"
          disabled={state.exporting || !events()}
          busy={state.exporting}
          onClick={() => void exportVideo()}
        >
          {state.exporting ? 'Exporting…' : 'Export video'}
        </ctx.ui.Button>
      }
    >
      <div class="flex flex-col gap-2 min-h-96 w-full">
        <Switch fallback={<RecorderNotice text="Loading player…" />}>
          <Match when={saved.error}>
            <RecorderErrorNotice retry={() => void refetch()} />
          </Match>
          <Match when={saved.state === 'pending' || saved.state === 'refreshing'}>
            <RecorderNotice text="Loading recording…" />
          </Match>
          <Match when={!events()}>
            <RecorderNotice text="Recording expired." />
          </Match>
          <Match when={(events()?.length ?? 0) < REPLAY_MIN_EVENTS}>
            <RecorderNotice text="Nothing to replay in this recording." />
          </Match>
          <Match when={playerKit.error}>
            <RecorderErrorNotice retry={() => location.reload()} text="Could not load the player." />
          </Match>
          <Match keyed when={loadedPlayerKit()}>
            {(kit) => (
              <Show keyed when={events()}>
                {(playable) => (
                  <div ref={replayRef(kit, playable)} class="flex h-70vh w-full items-start justify-center" />
                )}
              </Show>
            )}
          </Match>
        </Switch>
      </div>
    </ctx.ui.Dialog>
  )
}
