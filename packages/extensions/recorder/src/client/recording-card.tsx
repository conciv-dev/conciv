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
  const Dialog = host.useDialog()
  const utils = createTanstackQueryUtils(makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME))
  const [ref] = createResource(() => resolveRef(attachment))
  const [open, setOpen] = createSignal(false)
  const recording = useQuery(() => ({
    ...utils.recordings.get.queryOptions({input: {recordingId: ref()?.recordingId ?? ''}}),
    enabled: open() && Boolean(ref()),
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
    <div class="p-2 border border-pw-line rounded-pw-md bg-pw-fill flex gap-2 min-w-55 items-center overflow-hidden">
      <RecorderNotice text={ref()?.poster ?? 'Screen recording'} />
      <Button size="sm" disabled={!ref()} onClick={() => setOpen(true)}>
        Play
      </Button>
      <Dialog open={open()} onOpenChange={setOpen} dismissable size="xl" label="Screen recording replay">
        <Show when={open()}>
          <div class="flex flex-col gap-2">
            <div class="flex items-center">
              <RecorderNotice text={ref()?.poster ?? 'Screen recording'} />
              <Button class="ml-auto" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
            <Switch>
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
                  <Show
                    when={playable.length >= 2}
                    fallback={<RecorderNotice text="Nothing to replay in this recording." />}
                  >
                    <div ref={play(playable)} class="flex h-[70vh] w-full items-start justify-center" />
                  </Show>
                )}
              </Match>
            </Switch>
          </div>
        </Show>
      </Dialog>
    </div>
  )
}
