import {Match, Show, Switch, createSignal, splitProps, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {Button} from './button.js'
import {Dialog} from './dialog.js'

type View = 'closed' | 'fit' | 'actual' | 'failed'

const FOCUS_RING = 'focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:-0.125rem]'
const THUMBNAIL_BUTTON = `self-start max-w-full min-w-11 min-h-11 !cursor-zoom-in ${FOCUS_RING}`
const THUMBNAIL_IMAGE =
  'block max-w-full max-h-40 w-auto h-auto rounded-[var(--chat-radius-sm)] [border:1px_solid_var(--chat-line)]'
const FIT_BUTTON = `w-full align-top !cursor-zoom-in ${FOCUS_RING}`
const ACTUAL_BUTTON = `w-max min-w-full align-top !cursor-zoom-out ${FOCUS_RING}`
const FIT_IMAGE = 'block w-auto h-auto max-w-full max-h-[calc(100dvh-8rem)]'
const ACTUAL_IMAGE = 'block w-auto h-auto max-w-none'
const FOOTER = 'flex justify-end'
const FAILED = 'text-chat-danger text-[0.75rem] break-words'

export function ZoomableImage(props: {src: string; alt: string; portal?: HTMLElement}): JSX.Element {
  const [local] = splitProps(props, ['src', 'alt', 'portal'])
  const [view, setView] = createSignal<View>('closed')
  const actual = () => view() === 'actual'
  const fail = () => setView('failed')
  const viewer = () => (
    <Dialog
      open={view() === 'fit' || actual()}
      onOpenChange={(open) => setView(open ? 'fit' : 'closed')}
      label={local.alt}
      size="xl"
      dismissable
      footer={
        <div class={FOOTER}>
          <Button variant="ghost" onClick={() => setView('closed')}>
            Close
          </Button>
        </div>
      }
    >
      <Button
        variant="plain"
        size="none"
        class={actual() ? ACTUAL_BUTTON : FIT_BUTTON}
        aria-label={actual() ? 'Fit to window' : 'Show actual size'}
        onClick={() => setView(actual() ? 'fit' : 'actual')}
      >
        <img src={local.src} alt={local.alt} class={actual() ? ACTUAL_IMAGE : FIT_IMAGE} onError={fail} />
      </Button>
    </Dialog>
  )
  return (
    <Show when={view() !== 'failed'} fallback={<p class={FAILED}>Could not load {local.alt}</p>}>
      <Button
        variant="plain"
        size="none"
        class={THUMBNAIL_BUTTON}
        aria-label={`Open ${local.alt}`}
        onClick={() => setView('fit')}
      >
        <img src={local.src} alt={local.alt} class={THUMBNAIL_IMAGE} onError={fail} />
      </Button>
      <Switch>
        <Match when={local.portal}>{(mount) => <Portal mount={mount()}>{viewer()}</Portal>}</Match>
        <Match when={!local.portal}>{viewer()}</Match>
      </Switch>
    </Show>
  )
}
