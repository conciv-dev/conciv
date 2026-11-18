import {Match, Show, Switch, createMemo, createResource, onCleanup, type JSX} from 'solid-js'
import {usePlugin, type NoteCardProps} from '@conciv/plugin/experimental'
import {Recorder} from '../rpc.js'
import {REPLAY_MIN_EVENTS, type RrwebEvent} from '../protocol.js'
import {ExportVideoButton} from './export-video-button.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'
import {mountPlayer, type PlayerKit} from './player.js'
import {PlayerKitSwitch, usePlayerKit} from './player-kit.js'

type RecordingNote = {readonly recordingId: string; readonly summary?: string}

export function RecordingCard(props: NoteCardProps & {clientId: string}): JSX.Element {
  const ctx = usePlugin()
  const play = (recordingId: string): void =>
    void ctx.dialogs.open(() => (
      <RecordingReplay recording={{recordingId, summary: props.note.subtitle}} clientId={props.clientId} />
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

function RecordingReplay(props: {recording: RecordingNote; clientId: string}): JSX.Element {
  const ctx = usePlugin()
  const [saved, {refetch}] = createResource(
    () => props.recording.recordingId,
    (recordingId) => ctx.client.rpc(Recorder)['recordings.get']({recordingId}, {signal: ctx.signal}),
  )
  const recording = createMemo(() => (saved.state === 'ready' ? saved() : undefined))
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
          clientId={props.clientId}
          recordingId={() => Promise.resolve(props.recording.recordingId)}
          disabled={!events()}
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
          <Match when={saved.error}>
            <RecorderErrorNotice retry={() => void refetch()} />
          </Match>
          <Match when={saved.state === 'pending' || saved.state === 'refreshing'}>
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
