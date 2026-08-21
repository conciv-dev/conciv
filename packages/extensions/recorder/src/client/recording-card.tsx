import {Match, Show, Switch, createResource, createSignal, onCleanup, type JSX} from 'solid-js'
import {QueryClient, QueryClientProvider, useMutation, useQuery} from '@tanstack/solid-query'
import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {getExtensionApi, makeExtRpcClient, type AttachmentCardProps} from '@conciv/extension'
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
import {saveFileToDisk} from './download.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'

type AttachmentState = ReturnType<typeof useAttachment>
type AttachmentContentPart = Extract<AttachmentState, {content: unknown}>['content'][number]

function dataDocumentValue(part: AttachmentContentPart): string | null {
  if (part.type !== 'document') return null
  if (part.source.type !== 'data') return null
  return part.source.value
}

function contentRef(attachment: AttachmentState): RecordingRef | null {
  if (!('content' in attachment)) return null
  for (const part of attachment.content) {
    const value = dataDocumentValue(part)
    if (value !== null) return decodeRecordingRef(value)
  }
  return null
}

async function resolveRef(attachment: AttachmentState): Promise<RecordingRef | null> {
  const fromContent = contentRef(attachment)
  if (fromContent) return fromContent
  if (attachment.file) return parseRecordingRefJson(await attachment.file.text())
  return null
}

export function RecordingCard(props: AttachmentCardProps): JSX.Element {
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <CardBody remove={props.remove} />
    </QueryClientProvider>
  )
}

function CardBody(props: AttachmentCardProps): JSX.Element {
  const attachment = useAttachment()
  const host = getExtensionApi(RECORDER_NAME)
  const apiBase = host.useApiBase()
  const toast = host.useToast()
  const Dialog = host.useDialog()
  const utils = createTanstackQueryUtils(makeExtRpcClient<RecorderRouter>(apiBase(), RECORDER_NAME))
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
  const poster = (): string => ref()?.poster ?? 'Screen recording'
  const play = (playable: RrwebEvent[]) => (container: HTMLDivElement) => {
    onCleanup(mountPlayer(container, playable))
  }
  const exportVideo = useMutation(() => utils.recordings.exportVideo.mutationOptions())
  const downloadVideo = async (): Promise<void> => {
    const recordingId = ref()?.recordingId
    if (!recordingId) return
    const video = await exportVideo.mutateAsync({recordingId}).catch(() => null)
    if (!(video instanceof File)) {
      toast('Could not export the recording. Try again.')
      return
    }
    saveFileToDisk(video)
  }
  return (
    <div class="py-2 pe-2 ps-3 border border-chat-line rounded-chat-surface-md bg-chat-fill flex gap-2 min-w-55 items-center overflow-hidden">
      <RecorderNotice text={poster()} />
      <Button size="sm" disabled={!ref()} onClick={() => setOpen(true)}>
        Play
      </Button>
      {props.remove}
      <Dialog open={open()} onOpenChange={setOpen} dismissable size="xl" layer="inline" label="Screen recording replay">
        <Show when={open()}>
          <div class="flex flex-col gap-2">
            <div class="flex gap-2 items-center">
              <RecorderNotice text={poster()} />
              <Button
                class="ml-auto"
                variant="ghost"
                size="sm"
                disabled={exportVideo.isPending}
                onClick={() => void downloadVideo()}
              >
                {exportVideo.isPending ? 'Exporting…' : 'Export video'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
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
