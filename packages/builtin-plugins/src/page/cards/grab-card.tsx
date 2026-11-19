import {Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import CornerDownRight from 'lucide-solid/icons/corner-down-right'
import {useQuery} from '@conciv/client'
import {isCompleteAttachment, useAttachment, type AttachmentCardProps} from '@conciv/ui-kit-chat'
import {Button, Dialog, Loader} from '@conciv/ui-kit-system'
import {parseGrabPayload, type GrabPayload} from '@conciv/grab/grab-attachment'
import {sourceLabel} from '@conciv/grab'
import {GrabSnapshotFrame} from './grab-snapshot-frame.js'

type AttachmentState = ReturnType<typeof useAttachment>

type GrabPreview = NonNullable<GrabPayload['preview']>

const CARD =
  'text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)] p-3 rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] flex flex-col gap-2.5 items-start relative'
const PREVIEW_SLOT = 'relative max-w-full'
const OPEN_BUTTON =
  'absolute inset-0 cursor-pointer focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:-0.125rem]'
const SOURCE_LINE = 'text-chat-text-2 flex gap-1.5 [word-break:break-all] items-center'
const AGENT_TEXT =
  'text-chat-text-2 [font-family:var(--chat-mono)] text-xs whitespace-pre-wrap [word-break:break-all] m-0'
const CARD_SNAPSHOT = 'block w-auto h-auto max-w-full max-h-[40cqh]'

const LOADING_ROW = 'flex items-center gap-2'

const DIALOG_SNAPSHOT = 'block w-auto h-auto max-w-full max-h-[70vh]'

const SNAPSHOT_LABEL = 'Grabbed element snapshot'

const READING_LABEL = 'Reading grabbed element'

function decodeBase64Utf8(value: string): string | null {
  try {
    return new TextDecoder().decode(z.util.base64ToUint8Array(value))
  } catch {
    return null
  }
}

async function resolvePayload(attachment: AttachmentState): Promise<GrabPayload | null> {
  if (isCompleteAttachment(attachment))
    for (const part of attachment.content)
      if (part.type === 'document' && part.source.type === 'data') {
        const body = decodeBase64Utf8(part.source.value)
        return body === null ? null : parseGrabPayload(body)
      }
  if (attachment.file) return parseGrabPayload(await attachment.file.text())
  return null
}

function domPreview(preview: GrabPreview): Extract<GrabPreview, {kind: 'dom'}> | null {
  return preview.kind === 'dom' ? preview : null
}

function imagePreview(preview: GrabPreview): Extract<GrabPreview, {kind: 'image'}> | null {
  return preview.kind === 'image' ? preview : null
}

function Preview(props: {preview: GrabPreview; class: string}): JSX.Element {
  return (
    <Show
      when={domPreview(props.preview)}
      fallback={
        <Show when={imagePreview(props.preview)}>
          {(image) => (
            <img
              class={props.class}
              src={image().dataUrl}
              width={image().width}
              height={image().height}
              alt={SNAPSHOT_LABEL}
            />
          )}
        </Show>
      }
    >
      {(dom) => <GrabSnapshotFrame html={dom().html} width={dom().width} height={dom().height} class={props.class} />}
    </Show>
  )
}

function GrabBody(props: {payload: GrabPayload; remove?: JSX.Element}): JSX.Element {
  const [view, setView] = createStore({open: false, agentText: false})
  return (
    <div class={CARD} data-chat-grab>
      {props.remove}
      <Show when={props.payload.preview} fallback={<pre class={AGENT_TEXT}>{props.payload.text}</pre>}>
        {(preview) => (
          <div class={PREVIEW_SLOT}>
            <Preview preview={preview()} class={CARD_SNAPSHOT} />
            <Button
              variant="plain"
              size="none"
              class={OPEN_BUTTON}
              aria-label="Open grabbed element"
              onClick={() => setView('open', true)}
            />
          </div>
        )}
      </Show>
      <Show when={props.payload.source}>
        {(source) => (
          <Show when={sourceLabel(source())}>
            {(label) => (
              <span class={SOURCE_LINE}>
                <CornerDownRight class="text-chat-accent flex-none" size={12} aria-hidden="true" />
                in {label()}
              </span>
            )}
          </Show>
        )}
      </Show>
      <Dialog
        open={view.open}
        onOpenChange={(open) => setView('open', open)}
        title="Grabbed element"
        size="xl"
        dismissable
        footer={
          <Button variant="link" size="bare" onClick={() => setView('agentText', (shown) => !shown)}>
            {view.agentText ? 'Show snapshot' : 'What the agent sees'}
          </Button>
        }
      >
        <Show when={view.open}>
          <Show
            when={view.agentText ? null : props.payload.preview}
            fallback={<pre class={AGENT_TEXT}>{props.payload.text}</pre>}
          >
            {(preview) => <Preview preview={preview()} class={DIALOG_SNAPSHOT} />}
          </Show>
        </Show>
      </Dialog>
    </div>
  )
}

export function GrabCard(props: AttachmentCardProps): JSX.Element {
  const attachment = useAttachment()
  const payload = useQuery(() => ({
    queryKey: ['grab-card', 'attachment', attachment.id],
    queryFn: () => resolvePayload(attachment),
    retry: false,
  }))
  return (
    <Show
      when={!payload.isPending}
      fallback={
        <div class={CARD} aria-busy="true">
          <div class={LOADING_ROW}>
            <Loader.Root size="sm" bare translations={{value: () => READING_LABEL}}>
              <Loader.Indicator class="text-chat-text-3 size-4" />
            </Loader.Root>
            <span class={AGENT_TEXT}>{`${READING_LABEL}…`}</span>
          </div>
        </div>
      }
    >
      <Show
        when={payload.data}
        fallback={
          <div class={CARD} role="status">
            <span class={AGENT_TEXT}>Grabbed element could not be read</span>
          </div>
        }
      >
        {(value) => <GrabBody payload={value()} remove={props.remove} />}
      </Show>
    </Show>
  )
}
