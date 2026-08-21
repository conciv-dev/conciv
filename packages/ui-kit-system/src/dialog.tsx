import {Show, type JSX} from 'solid-js'
import {Dialog as Ark} from '@ark-ui/solid/dialog'

const BACKDROP = 'fixed inset-0 z-[2147483646] [background:var(--chat-backdrop)]'
const POSITIONER = 'fixed inset-0 z-[2147483647] flex items-start justify-center p-4 overflow-y-auto'
const CONTENT_BASE =
  'my-auto max-w-[calc(100vw-2rem)] rounded-chat-surface-lg bg-chat-panel text-chat-text border border-chat-line shadow-chat-lg overflow-hidden focus-visible:outline-none data-[state=open]:anim-rise data-[state=closed]:anim-presence-out'
const SHELL = 'flex flex-col min-h-0 max-h-[calc(100dvh-2rem)]'
const HEADER = 'shrink-0 px-4 pt-4'
const TITLE = 'text-chat-text-hi text-sm font-semibold m-0'
const BODY = 'flex-1 min-h-0 min-w-0 p-4 overflow-x-auto overflow-y-auto'
const FOOTER = 'shrink-0 px-4 pb-4'
const CONTENT_SIZE = {
  md: 'w-90',
  lg: 'w-[min(34rem,calc(100vw-2rem))]',
  xl: 'w-[min(75rem,calc(100vw-2rem))]',
}

type DialogName = {title: string; label?: never} | {label: string; title?: never}

export function Dialog(
  props: DialogName & {
    open: boolean
    onOpenChange?: (open: boolean) => void
    footer?: JSX.Element
    role?: 'dialog' | 'alertdialog'
    initialFocus?: () => HTMLElement | null
    restoreFocus?: boolean
    dismissable?: boolean
    size?: 'md' | 'lg' | 'xl'
    layer?: 'page' | 'inline'
    children: JSX.Element
  },
): JSX.Element {
  return (
    <Ark.Root
      open={props.open}
      onOpenChange={(d) => props.onOpenChange?.(d.open)}
      role={props.role ?? 'dialog'}
      modal
      closeOnEscape={props.dismissable ?? false}
      closeOnInteractOutside={props.dismissable ?? false}
      initialFocusEl={props.initialFocus}
      restoreFocus={props.restoreFocus ?? true}
    >
      <Ark.Backdrop class={BACKDROP} />
      <Ark.Positioner class={POSITIONER}>
        <Ark.Content
          class={`${CONTENT_SIZE[props.size ?? 'md']}  ${CONTENT_BASE}`}
          aria-label={props.title === undefined ? props.label : undefined}
        >
          <div class={SHELL}>
            <Show when={props.title}>
              {(title) => (
                <div class={HEADER}>
                  <Ark.Title class={TITLE}>{title()}</Ark.Title>
                </div>
              )}
            </Show>
            <div class={BODY}>{props.children}</div>
            <Show when={props.footer}>{(footer) => <div class={FOOTER}>{footer()}</div>}</Show>
          </div>
        </Ark.Content>
      </Ark.Positioner>
    </Ark.Root>
  )
}

export type DialogApi = typeof Dialog
