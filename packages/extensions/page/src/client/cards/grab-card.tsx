import {createResource, createSignal, Show, type JSX} from 'solid-js'
import {useAttachment} from '@conciv/ui-kit-chat'
import {Button, Dialog} from '@conciv/ui-kit-system'
import type {AttachmentCardProps} from '@conciv/extension'
import {parseGrabPayload, type GrabPayload} from '@conciv/grab/grab-attachment'
import {sourceLabel} from '@conciv/grab'
import {GrabSnapshotFrame} from './grab-snapshot-frame.js'

type AttachmentState = ReturnType<typeof useAttachment>

type GrabPreview = NonNullable<GrabPayload['preview']>

const CARD =
  'text-[0.6875rem] font-pw-mono p-3 border border-pw-line rounded-pw-md bg-pw-fill flex flex-col gap-2.5 items-start relative'
const PREVIEW_SLOT = 'relative max-w-full max-h-[13.75rem] overflow-hidden'
const OPEN_BUTTON = 'absolute inset-0 cursor-pointer'
const SOURCE_LINE = 'text-pw-text-2 flex gap-1.5 [word-break:break-all] items-center'
const AGENT_TEXT = 'text-pw-text-2 font-pw-mono text-xs whitespace-pre-wrap [word-break:break-all] m-0'
const SNAPSHOT_IMAGE = 'block w-auto h-auto max-w-full'

const SNAPSHOT_LABEL = 'Grabbed element snapshot'

function decodeBase64Utf8(value: string): string | null {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

async function resolvePayload(attachment: AttachmentState): Promise<GrabPayload | null> {
  if ('content' in attachment)
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

function Preview(props: {preview: GrabPreview; scale: number}): JSX.Element {
  return (
    <Show
      when={domPreview(props.preview)}
      fallback={
        <Show when={imagePreview(props.preview)}>
          {(image) => (
            <img
              class={SNAPSHOT_IMAGE}
              src={image().dataUrl}
              width={image().width * props.scale}
              height={image().height * props.scale}
              alt={SNAPSHOT_LABEL}
            />
          )}
        </Show>
      }
    >
      {(dom) => <GrabSnapshotFrame html={dom().html} width={dom().width} height={dom().height} scale={props.scale} />}
    </Show>
  )
}

function GrabBody(props: {payload: GrabPayload; remove?: JSX.Element}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [showAgentText, setShowAgentText] = createSignal(false)
  return (
    <div class={CARD} data-pw-grab>
      {props.remove}
      <Show when={props.payload.preview} fallback={<pre class={AGENT_TEXT}>{props.payload.text}</pre>}>
        {(preview) => (
          <div class={PREVIEW_SLOT}>
            <Preview preview={preview()} scale={1} />
            <Button
              variant="plain"
              size="none"
              class={OPEN_BUTTON}
              aria-label="Open grabbed element"
              onClick={() => setOpen(true)}
            />
          </div>
        )}
      </Show>
      <Show when={props.payload.source}>
        {(source) => (
          <Show when={sourceLabel(source())}>
            {(label) => (
              <span class={SOURCE_LINE}>
                <span class="text-pw-accent" aria-hidden="true">
                  ↳
                </span>{' '}
                in {label()}
              </span>
            )}
          </Show>
        )}
      </Show>
      <Dialog
        open={open()}
        onOpenChange={setOpen}
        title="Grabbed element"
        size="xl"
        dismissable
        footer={
          <Button variant="link" size="bare" onClick={() => setShowAgentText((shown) => !shown)}>
            {showAgentText() ? 'Show snapshot' : 'What the agent sees'}
          </Button>
        }
      >
        <Show when={open()}>
          <Show
            when={showAgentText() ? null : props.payload.preview}
            fallback={<pre class={AGENT_TEXT}>{props.payload.text}</pre>}
          >
            {(preview) => <Preview preview={preview()} scale={2} />}
          </Show>
        </Show>
      </Dialog>
    </div>
  )
}

export function GrabCard(props: AttachmentCardProps): JSX.Element {
  const attachment = useAttachment()
  const [payload] = createResource(() => resolvePayload(attachment))
  return (
    <Show
      when={payload.state === 'ready' || payload.state === 'errored'}
      fallback={
        <div class={CARD} aria-busy="true">
          <span class={AGENT_TEXT}>Reading grabbed element…</span>
        </div>
      }
    >
      <Show
        when={payload()}
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
