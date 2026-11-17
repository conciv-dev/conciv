import {Show, splitProps, type JSX} from 'solid-js'
import X from 'lucide-solid/icons/x'
import {TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {REMOVE, REMOVE_WRAPPER} from './classes.js'

const FRAME =
  'relative flex flex-col gap-0.5 py-2 px-2.5 rounded-chat-surface-sm border border-chat-line bg-chat-fill text-chat-sm text-chat-text-hi'
const STAGED = `${FRAME} min-w-24 max-w-56`
const WIDE = `${FRAME} w-full`

export interface NoteFrameProps {
  wide?: boolean
  remove?: {label: string; onRemove: () => void}
  children: JSX.Element
}

export function NoteFrame(props: NoteFrameProps): JSX.Element {
  const [local] = splitProps(props, ['wide', 'remove', 'children'])
  const frameClass = () => `${local.wide ? WIDE : STAGED} ${local.remove ? 'pe-7' : ''}`

  return (
    <div class={frameClass()}>
      {local.children}
      <Show when={local.remove}>
        {(remove) => (
          <TooltipIconButtonSlot tooltip={remove().label} wrapperClass={REMOVE_WRAPPER}>
            {(buttonProps) => (
              <button {...buttonProps()} class={REMOVE} onClick={() => remove().onRemove()}>
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </TooltipIconButtonSlot>
        )}
      </Show>
    </div>
  )
}
