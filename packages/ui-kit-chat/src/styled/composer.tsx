import {Show, type JSX} from 'solid-js'
import {ArrowUp, Square} from 'lucide-solid'
import {Composer as ComposerPrimitive} from '../primitives/composer/composer.js'
import {useComposer} from '../store/chat-context.js'

export type ComposerProps = {placeholder?: string; children?: JSX.Element}

const BTN =
  'size-8.5 rounded-[var(--chat-radius-pill)] [border:none] cursor-pointer shrink-0 inline-flex items-center justify-center [transition:background-color_120ms,transform_120ms] [&:active:not(:disabled)]:scale-[0.92]'
const SEND = `${BTN} [background:var(--chat-accent)] text-[color:var(--chat-on-accent)] [&:hover:not(:disabled)]:[background:var(--chat-accent-hi)] disabled:opacity-40 disabled:cursor-default`
const CANCEL = `${BTN} [background:var(--chat-text-3)] [color:var(--chat-on-accent)]`
const INPUT =
  'block max-h-30 px-2 pb-1 pt-2 [color:var(--chat-text)] text-[length:var(--chat-text-md)] leading-[1.45] placeholder:[color:var(--chat-text-3)]'

// Neutral styled composer matching the widget: a borderless autosize textarea stacked above an
// actions row, all inside ONE focus-within-accented box (no double border). Staged attachments render
// as chips above; the `children` slot carries the widget's composer controls (model/session, actions).
export function Composer(props: ComposerProps): JSX.Element {
  const composer = useComposer()
  return (
    <ComposerPrimitive.Root class="flex flex-col gap-1.5">
      <div class="flex flex-wrap gap-1 empty:hidden">
        <ComposerPrimitive.Attachments />
      </div>
      <div class="px-1.5 pb-1.5 pt-1 rounded-[var(--chat-radius-md)] [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] [transition:border-color_120ms] focus-within:[border-color:var(--chat-accent)]">
        <ComposerPrimitive.Input
          unstyled
          placeholder={props.placeholder ?? 'Message…'}
          class={INPUT}
          aria-label="Message"
        />
        <div class="pt-0.5 flex gap-1 items-center">
          <Show when={props.children}>{props.children}</Show>
          <div class="ml-auto flex gap-1 items-center">
            <ComposerPrimitive.Cancel class={CANCEL} aria-label="Stop">
              <Square size={14} fill="currentColor" aria-hidden="true" />
            </ComposerPrimitive.Cancel>
            <Show when={!composer.canCancel()}>
              <ComposerPrimitive.Send class={SEND} aria-label="Send">
                <ArrowUp size={18} aria-hidden="true" />
              </ComposerPrimitive.Send>
            </Show>
          </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
  )
}
