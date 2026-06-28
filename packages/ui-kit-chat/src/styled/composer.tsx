import {Show, type JSX} from 'solid-js'
import {Composer as ComposerPrimitive} from '../primitives/composer/composer.js'

export type ComposerProps = {placeholder?: string; children?: JSX.Element}

const SEND =
  'ml-auto inline-flex items-center justify-center size-9 rounded-[var(--chat-radius-pill)] [border:none] [background:var(--chat-accent)] text-[color:var(--chat-on-accent)] cursor-pointer shrink-0 hover:[background:var(--chat-accent-hi)] disabled:opacity-40 disabled:cursor-default'
const CANCEL =
  'ml-auto inline-flex items-center justify-center size-9 rounded-[var(--chat-radius-pill)] [border:none] [background:var(--chat-fill-strong)] text-[color:var(--chat-text)] cursor-pointer shrink-0'
const INPUT =
  'flex-1 min-w-0 max-h-30 [background:transparent] [border:none] [color:var(--chat-text)] text-[0.8125rem] leading-[1.45] resize-none focus-visible:outline-none placeholder:[color:var(--chat-text-3)]'

// Neutral styled composer: an autosize input flanked by Send (or Cancel while running). Staged
// attachments render as chips above. The `children` slot carries the widget's composer controls
// (model/session selectors, actions).
export function Composer(props: ComposerProps): JSX.Element {
  return (
    <ComposerPrimitive.Root class="flex flex-col gap-1.5">
      <div class="flex flex-wrap gap-1 empty:hidden">
        <ComposerPrimitive.Attachments />
      </div>
      <div class="px-3 py-2 rounded-[var(--chat-radius-lg)] flex gap-2 [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] items-end focus-within:[border-color:var(--chat-accent)]">
        <ComposerPrimitive.Input placeholder={props.placeholder ?? 'Message…'} class={INPUT} aria-label="Message" />
        <ComposerPrimitive.Cancel class={CANCEL} aria-label="Stop">
          ◼
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send class={SEND} aria-label="Send">
          ↑
        </ComposerPrimitive.Send>
      </div>
      <Show when={props.children}>
        <div class="flex gap-1.5 items-center">{props.children}</div>
      </Show>
    </ComposerPrimitive.Root>
  )
}
