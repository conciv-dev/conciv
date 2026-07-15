import {Show, type JSX} from 'solid-js'
import {Toast as Ark, Toaster as ArkToaster, createToaster} from '@ark-ui/solid/toast'
import {XIcon} from 'lucide-solid'

const ROOT =
  'relative w-80 max-w-[calc(100vw-2rem)] flex flex-col gap-1 items-start py-3 pl-3.5 pr-9 rounded-pw-md bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg [translate:var(--x)_var(--y)] [scale:var(--scale)] [z-index:var(--z-index)] [height:var(--height)] [opacity:var(--opacity)] [transition:translate_400ms_var(--pw-ease),scale_400ms_var(--pw-ease),opacity_240ms_var(--pw-ease),height_400ms_var(--pw-ease)] data-[type=error]:[border-color:var(--pw-danger)] data-[type=success]:[border-color:var(--pw-success)]'
const TITLE = 'text-[0.8125rem] font-pw text-pw-text-hi'
const DESCRIPTION = 'text-[0.75rem] text-pw-text-2'
const CLOSE =
  'absolute top-1.5 right-1.5 inline-flex items-center justify-center size-7 rounded-pw-sm text-pw-text-3 cursor-pointer hover:text-pw-text hover:bg-pw-fill-strong focus-ring'

type ToasterInstance = ReturnType<typeof createToaster>

function Toaster(props: {toaster: ToasterInstance}): JSX.Element {
  return (
    <ArkToaster toaster={props.toaster}>
      {(toast) => (
        <Ark.Root class={ROOT}>
          <Ark.Title class={TITLE}>{toast().title}</Ark.Title>
          <Show when={toast().description}>
            <Ark.Description class={DESCRIPTION}>{toast().description}</Ark.Description>
          </Show>
          <Ark.CloseTrigger class={CLOSE} aria-label="Dismiss notification">
            <XIcon size={16} />
          </Ark.CloseTrigger>
        </Ark.Root>
      )}
    </ArkToaster>
  )
}

export const Toast = Object.assign({}, Ark, {Toaster, createToaster})
export {createToaster}
export type {ToasterInstance}
