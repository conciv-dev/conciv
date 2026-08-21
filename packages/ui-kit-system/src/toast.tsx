import {Show, type JSX} from 'solid-js'
import {Toast as Ark, Toaster as ArkToaster, createToaster} from '@ark-ui/solid/toast'
import XIcon from 'lucide-solid/icons/x'

const ROOT =
  'relative w-80 max-w-[calc(100vw-2rem)] flex flex-col gap-1 items-start py-3 pl-3.5 pr-9 rounded-chat-surface-md bg-chat-panel text-chat-text border border-chat-line shadow-chat-lg [translate:var(--x)_var(--y)] [scale:var(--scale)] [z-index:var(--z-index)] [height:var(--height)] [opacity:var(--opacity)] [transition:translate_400ms_var(--chat-ease),scale_400ms_var(--chat-ease),opacity_240ms_var(--chat-ease),height_400ms_var(--chat-ease)] data-[type=error]:[border-color:var(--chat-danger)] data-[type=success]:[border-color:var(--chat-success)]'
const TITLE = 'text-[0.8125rem] font-chat text-chat-text-hi'
const DESCRIPTION = 'text-[0.75rem] text-chat-text-2'
const CLOSE =
  'absolute top-1.5 right-1.5 inline-flex items-center justify-center size-7 rounded-chat-surface-sm text-chat-text-3 cursor-pointer hover:text-chat-text hover:bg-chat-fill-strong focus-ring'

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
export {ArkToaster as ToastGroup, createToaster}
export type {ToasterInstance}
