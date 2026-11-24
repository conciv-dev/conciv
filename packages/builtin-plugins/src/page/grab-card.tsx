import {Show, type JSX, createSignal, onMount} from 'solid-js'
import {createStore} from 'solid-js/store'
import CornerDownRight from 'lucide-solid/icons/corner-down-right'
import {useQuery} from '@conciv/client'
import {type MountedSession} from '@conciv/plugin/experimental'
import {type NoteCardProps} from '@internal/plugin'
import {Button, Dialog, Loader} from '@conciv/ui-kit-system'
import {sourceLabel} from './grab-label.js'
import {Definition, readGrabId, type GrabId, type StoredGrab} from '@conciv/plugin-page/rpc'

type GrabPreview = NonNullable<StoredGrab['preview']>

const CARD =
  'text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)] flex flex-col gap-2.5 items-start min-w-0'
const PREVIEW_SLOT = 'relative max-w-full'
const OPEN_BUTTON =
  'absolute inset-0 cursor-pointer focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:-0.125rem]'
const SOURCE_LINE = 'text-chat-text-2 flex gap-1.5 [word-break:break-all] items-center'
const AGENT_TEXT =
  'text-chat-text-2 [font-family:var(--chat-mono)] text-xs whitespace-pre-wrap [word-break:break-all] m-0'
const CARD_SNAPSHOT = 'block w-auto h-auto max-w-full max-h-[40cqh]'

const STAGED_SNAPSHOT = 'block h-14 w-40 object-contain'

const LOADING_ROW = 'flex items-center gap-2'

const DIALOG_SNAPSHOT = 'block w-auto h-auto max-w-full max-h-[70vh]'

const SNAPSHOT_LABEL = 'Grabbed element snapshot'

const READING_LABEL = 'Reading grabbed element'

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

function GrabBody(props: {payload: StoredGrab; staged: boolean}): JSX.Element {
  const [view, setView] = createStore({open: false, agentText: false})
  return (
    <div class={CARD} data-chat-grab>
      <Show when={props.payload.preview} fallback={<pre class={AGENT_TEXT}>{props.payload.text}</pre>}>
        {(preview) => (
          <div class={PREVIEW_SLOT}>
            <Preview preview={preview()} class={props.staged ? STAGED_SNAPSHOT : CARD_SNAPSHOT} />
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

function Unreadable(): JSX.Element {
  return (
    <span class={AGENT_TEXT} role="status">
      Grabbed element could not be read
    </span>
  )
}

export function GrabNoteCard(props: NoteCardProps): JSX.Element {
  const id = () => readGrabId(props.note.href).at(0)
  return (
    <Show when={props.session} fallback={<Unreadable />}>
      {(session) => (
        <Show when={id()} fallback={<Unreadable />}>
          {(grabId) => <StoredGrabCard session={session()} id={grabId()} staged={props.note.commentId !== undefined} />}
        </Show>
      )}
    </Show>
  )
}

function StoredGrabCard(props: {session: MountedSession; id: GrabId; staged: boolean}): JSX.Element {
  const grab = useQuery(() => ({
    ...props.session.server.client.rpc(Definition)['grabs.get'].queryOptions({input: {id: props.id}}),
    retry: false,
  }))
  return (
    <Show
      when={!grab.isPending}
      fallback={
        <div class={LOADING_ROW} aria-busy="true">
          <Loader.Root size="sm" bare translations={{value: () => READING_LABEL}}>
            <Loader.Indicator class="text-chat-text-3 size-4" />
          </Loader.Root>
          <span class={AGENT_TEXT}>{`${READING_LABEL}…`}</span>
        </div>
      }
    >
      <Show when={grab.data} fallback={<Unreadable />}>
        {(value) => <GrabBody payload={value()} staged={props.staged} />}
      </Show>
    </Show>
  )
}

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:"

const FRAME = 'block border-none bg-transparent pointer-events-none'

const BASE_FALLBACK = '#000'

const OVERLAY_FALLBACK = 'transparent'

const SAFE_COLOR = /^[\w\s%.,()/#-]+$/

type Surface = {base: string; overlay: string}

const DEFAULT_SURFACE: Surface = {base: BASE_FALLBACK, overlay: OVERLAY_FALLBACK}

function safeColor(value: string, fallback: string): string {
  const trimmed = value.trim()
  return trimmed !== '' && SAFE_COLOR.test(trimmed) ? trimmed : fallback
}

function readSurface(node: Element): Surface {
  const styles = getComputedStyle(node)
  return {
    base: safeColor(styles.getPropertyValue('--chat-panel'), BASE_FALLBACK),
    overlay: safeColor(styles.getPropertyValue('--chat-fill'), OVERLAY_FALLBACK),
  }
}

function documentFor(html: string, surface: Surface): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html{background:${surface.base}}body{margin:0;background:${surface.overlay}}</style></head><body>${html}</body></html>`
}

export function GrabSnapshotFrame(props: {html: string; width: number; height: number; class: string}): JSX.Element {
  const [surface, setSurface] = createSignal<Surface>(DEFAULT_SURFACE)
  let node: SVGSVGElement | undefined
  onMount(() => {
    if (node) setSurface(readSurface(node))
  })
  return (
    <svg
      ref={(element) => {
        node = element
      }}
      class={props.class}
      width={props.width}
      height={props.height}
      viewBox={`0 0 ${props.width} ${props.height}`}
    >
      <foreignObject width={props.width} height={props.height}>
        <iframe
          class={FRAME}
          title="Grabbed element snapshot"
          sandbox=""
          referrerpolicy="no-referrer"
          scrolling="no"
          tabindex={-1}
          width={props.width}
          height={props.height}
          srcdoc={documentFor(props.html, surface())}
        />
      </foreignObject>
    </svg>
  )
}
