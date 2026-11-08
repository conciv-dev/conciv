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
const FILL_POSITIONER = 'absolute inset-0 z-1 flex flex-col'
const FILL_CONTENT =
  'flex flex-1 flex-col min-h-0 min-w-0 [background:var(--chat-bg)] text-chat-text overflow-hidden focus-visible:outline-none data-[state=open]:anim-tab-right data-[state=closed]:anim-presence-out'

type DialogName = {title: string; label?: never} | {label: string; title?: never}

export function Dialog(
  props: DialogName & {
    open: boolean
    onOpenChange?: (open: boolean) => void
    onExitComplete?: () => void
    footer?: JSX.Element
    role?: 'dialog' | 'alertdialog'
    initialFocus?: () => HTMLElement | null
    restoreFocus?: boolean
    dismissable?: boolean
    size?: 'md' | 'lg' | 'xl'
    variant?: 'card' | 'fill'
    layer?: 'page' | 'inline'
    children: JSX.Element
  },
): JSX.Element {
  const fill = () => props.variant === 'fill'
  return (
    <Ark.Root
      open={props.open}
      onOpenChange={(d) => props.onOpenChange?.(d.open)}
      onExitComplete={() => props.onExitComplete?.()}
      role={props.role ?? 'dialog'}
      modal
      preventScroll={!fill()}
      closeOnEscape={props.dismissable ?? false}
      closeOnInteractOutside={!fill() && (props.dismissable ?? false)}
      initialFocusEl={props.initialFocus}
      restoreFocus={props.restoreFocus ?? true}
    >
      <Show when={!fill()}>
        <Ark.Backdrop class={BACKDROP} />
      </Show>
      <Ark.Positioner class={fill() ? FILL_POSITIONER : POSITIONER}>
        <Ark.Content
          class={fill() ? FILL_CONTENT : `${CONTENT_SIZE[props.size ?? 'md']}  ${CONTENT_BASE}`}
          aria-label={props.title === undefined ? props.label : undefined}
        >
          <Show
            when={fill()}
            fallback={
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
            }
          >
            {props.children}
          </Show>
        </Ark.Content>
      </Ark.Positioner>
    </Ark.Root>
  )
}

export type DialogApi = typeof Dialog
