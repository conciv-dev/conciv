import {Match, Show, Switch, createMemo, onCleanup, type JSX} from 'solid-js'
import {useMutation, useQuery} from '@conciv/client'
import {usePlugin, type NoteCardProps} from '@conciv/plugin/experimental'
import {REPLAY_MIN_EVENTS, Recorder, type RrwebEvent} from './rpc.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {mountPlayer, type PlayerKit} from './player.js'
import {PlayerKitSwitch, usePlayerKit} from './player-kit.js'
import {createStore} from 'solid-js/store'
import {Effect} from 'effect'
import {saveFileToDisk, videoPieceReader} from './download.js'
import {exportRecording} from './panel.js'
import type {PluginRuntime} from './subscription-ref-signal.js'

function ExportVideoButton(props: {recordingId: string; runtime: PluginRuntime; disabled?: boolean}): JSX.Element {
  const ctx = usePlugin()
  const exportPiece = useMutation(() => ctx.client.rpc(Recorder)['recordings.exportVideo'].mutationOptions())
  const [state, setState] = createStore({exporting: false})

  const exportVideo = (): void => {
    setState('exporting', true)
    void props.runtime.runPromise(
      exportRecording({
        save: Effect.succeed({recordingId: props.recordingId}),
        readPiece: videoPieceReader(exportPiece.mutateAsync),
        saveFile: (file) => Effect.sync(() => saveFileToDisk(file)),
      }).pipe(
        Effect.catch((error) =>
          Effect.andThen(
            Effect.logError('recorder: the recording could not be exported', error),
            Effect.sync(
              () => void ctx.toast.show({title: 'Could not export the recording. Try again.', variant: 'error'}),
            ),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setState('exporting', false))),
      ),
    )
  }

  return (
    <ctx.ui.Button
      variant="neutral"
      size="small"
      disabled={state.exporting || props.disabled}
      busy={state.exporting}
      onClick={exportVideo}
    >
      {state.exporting ? 'Exporting…' : 'Export video'}
    </ctx.ui.Button>
  )
}

type RecordingNote = {readonly recordingId: string; readonly summary?: string}

export function RecordingCard(props: NoteCardProps & {runtime: PluginRuntime}): JSX.Element {
  const ctx = usePlugin()
  const play = (recordingId: string): void =>
    void ctx.dialogs.open(() => (
      <RecordingReplay recording={{recordingId, summary: props.note.subtitle}} runtime={props.runtime} />
    ))

  return (
    <div class="flex gap-2 min-w-0 items-center">
      <ctx.ui.Icon name="clapperboard" size="small" class="text-chat-text-3 shrink-0" />
      <span class="flex flex-1 flex-col min-w-0">
        <span class="text-chat-sm text-chat-text-hi font-chat truncate">{props.note.label}</span>
        <Show when={props.note.subtitle}>
          {(subtitle) => <span class="text-chat-xs text-chat-text-3 font-chat truncate">{subtitle()}</span>}
        </Show>
      </span>
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

function RecordingReplay(props: {recording: RecordingNote; runtime: PluginRuntime}): JSX.Element {
  const ctx = usePlugin()
  const saved = useQuery(() => ({
    ...ctx.client.rpc(Recorder)['recordings.get'].queryOptions({input: {recordingId: props.recording.recordingId}}),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  }))
  const recording = createMemo(() => (saved.isSuccess ? saved.data : undefined))
  const events = createMemo((): RrwebEvent[] | undefined => {
    const read = recording()
    return read?.kind === 'found' ? read.events : undefined
  })
  const playerKit = usePlayerKit()
  const replayRef = (kit: PlayerKit, playable: RrwebEvent[]) => (container: HTMLDivElement) => {
    onCleanup(mountPlayer(kit, container, playable))
  }

  return (
    <ctx.ui.Dialog
      title="Screen recording replay"
      description={props.recording.summary}
      size="x-large"
      footer={
        <ExportVideoButton
          recordingId={props.recording.recordingId}
          runtime={props.runtime}
          disabled={saved.isFetching || !events()}
        />
      }
    >
      <div class="flex flex-col gap-2 min-h-96 w-full">
        <Switch
          fallback={
            <PlayerKitSwitch kit={playerKit}>
              {(kit) => (
                <Show keyed when={events()}>
                  {(playable) => (
                    <div ref={replayRef(kit, playable)} class="flex h-70vh w-full items-start justify-center" />
                  )}
                </Show>
              )}
            </PlayerKitSwitch>
          }
        >
          <Match when={saved.isError}>
            <RecorderErrorNotice retry={() => void saved.refetch()} />
          </Match>
          <Match when={saved.isFetching}>
            <RecorderNotice text="Loading recording…" />
          </Match>
          <Match when={recording()?.kind === 'missing'}>
            <RecorderNotice text="Recording not found: it is no longer saved in this project." />
          </Match>
          <Match when={!events()}>
            <RecorderNotice text="Recording expired." />
          </Match>
          <Match when={(events()?.length ?? 0) < REPLAY_MIN_EVENTS}>
            <RecorderNotice text="Nothing to replay in this recording." />
          </Match>
        </Switch>
      </div>
    </ctx.ui.Dialog>
  )
}
