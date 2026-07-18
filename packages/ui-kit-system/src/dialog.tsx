import type {JSX} from 'solid-js'
import {Dialog as Ark} from '@ark-ui/solid/dialog'

const BACKDROP = 'fixed inset-0 z-[2147483646] bg-[rgba(0,0,0,0.55)] [backdrop-filter:blur(0.125rem)]'
const POSITIONER = 'fixed inset-0 z-[2147483647] flex items-center justify-center p-4'
const CONTENT_BASE =
  'max-w-[calc(100vw-2rem)] rounded-pw-lg bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg p-4 focus-visible:outline-none data-[state=open]:anim-rise data-[state=closed]:anim-presence-out'
const CONTENT_SIZE = {md: 'w-90', xl: 'w-[min(75rem,calc(100vw-2rem))]'}

export function Dialog(props: {
  open: boolean
  onOpenChange?: (open: boolean) => void
  label?: string
  dismissable?: boolean
  size?: 'md' | 'xl'
  children: JSX.Element
}): JSX.Element {
  return (
    <Ark.Root
      open={props.open}
      onOpenChange={(d) => props.onOpenChange?.(d.open)}
      role="alertdialog"
      modal
      closeOnEscape={props.dismissable ?? false}
      closeOnInteractOutside={props.dismissable ?? false}
    >
      <Ark.Backdrop class={BACKDROP} />
      <Ark.Positioner class={POSITIONER}>
        <Ark.Content class={`${CONTENT_SIZE[props.size ?? 'md']}  ${CONTENT_BASE}`} aria-label={props.label}>
          {props.children}
        </Ark.Content>
      </Ark.Positioner>
    </Ark.Root>
  )
}

export type DialogApi = typeof Dialog
