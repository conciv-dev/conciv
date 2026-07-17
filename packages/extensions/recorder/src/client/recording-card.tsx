import {Match, Show, Switch, createResource, createSignal, onCleanup, type JSX} from 'solid-js'
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/solid-query'
import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import {useAttachment} from '@conciv/ui-kit-chat'
import {Button} from '@conciv/ui-kit-system'
import {
  RECORDER_NAME,
  decodeRecordingRef,
  parseRecordingRefJson,
  type RecordingRef,
  type RrwebEvent,
} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {mountPlayer} from './player.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'

type AttachmentState = ReturnType<typeof useAttachment>

async function resolveRef(attachment: AttachmentState): Promise<RecordingRef | null> {
  if ('content' in attachment)
    for (const part of attachment.content)
      if (part.type === 'document' && part.source.type === 'data') return decodeRecordingRef(part.source.value)
  if (attachment.file) return parseRecordingRefJson(await attachment.file.text())
  return null
}

export function RecordingCard(): JSX.Element {
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <CardBody />
    </QueryClientProvider>
  )
}

function CardBody(): JSX.Element {
  const attachment = useAttachment()
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const utils = createTanstackQueryUtils(makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME))
  const [ref] = createResource(() => resolveRef(attachment))
  const [wantsPlay, setWantsPlay] = createSignal(false)
  const recording = useQuery(() => ({
    ...utils.recordings.get.queryOptions({input: {recordingId: ref()?.recordingId ?? ''}}),
    enabled: wantsPlay() && Boolean(ref()),
  }))
  const events = (): RrwebEvent[] | null => {
    const data = recording.data
    return data && 'events' in data ? (data.events ?? null) : null
  }
  const expired = (): boolean => Boolean(recording.data && 'expired' in recording.data)
  const play = (playable: RrwebEvent[]) => (container: HTMLDivElement) => {
    onCleanup(mountPlayer(container, playable, () => true))
  }
  return (
    <div class="p-2 border border-pw-line rounded-pw-md bg-pw-fill flex flex-col gap-2 min-w-55 overflow-hidden">
      <Switch fallback={<RecorderNotice text={ref()?.poster ?? 'Screen recording'} />}>
        <Match when={!wantsPlay()}>
          <div class="flex gap-2 items-center">
            <RecorderNotice text={ref()?.poster ?? 'Screen recording'} />
            <Button size="sm" disabled={!ref()} onClick={() => setWantsPlay(true)}>
              Play
            </Button>
          </div>
        </Match>
        <Match when={recording.isPending}>
          <RecorderNotice text="Loading recording…" />
        </Match>
        <Match when={recording.isError}>
          <RecorderErrorNotice text="Could not load the recording." retry={() => void recording.refetch()} />
        </Match>
        <Match when={expired()}>
          <RecorderNotice text="Recording expired." />
        </Match>
        <Match when={events()} keyed>
          {(playable) => (
            <Show when={playable.length >= 2} fallback={<RecorderNotice text="Nothing to replay in this recording." />}>
              <div ref={play(playable)} class="min-h-30 w-full" />
            </Show>
          )}
        </Match>
      </Switch>
    </div>
  )
}
