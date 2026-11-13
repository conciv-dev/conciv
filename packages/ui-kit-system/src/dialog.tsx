import {Show, splitProps, type ComponentProps, type JSX} from 'solid-js'
import {Portal as SolidPortal} from 'solid-js/web'
import {Dialog as Ark} from '@ark-ui/solid/dialog'
import {useEnvironmentContext} from '@ark-ui/solid/environment'
import X from 'lucide-solid/icons/x'
import {Button} from './button.js'
import {isShadowRoot} from './realm.js'

const TOP_LAYER = 'z-[2147483647]'
const LAYER = `fixed ${TOP_LAYER}`
const BACKDROP = 'fixed inset-0 z-[2147483646] [background:var(--chat-backdrop)]'
const POSITIONER = `fixed inset-0 ${TOP_LAYER} flex items-start justify-center p-4 overflow-y-auto`
const CONTENT_BASE =
  'my-auto max-w-[calc(100vw-2rem)] rounded-chat-surface-lg bg-chat-panel text-chat-text font-chat font-normal text-[0.875rem] leading-[1.45] border border-chat-line shadow-chat-lg overflow-hidden focus-visible:outline-none data-[state=open]:anim-rise data-[state=closed]:anim-presence-out'
const SHELL = 'flex flex-col min-h-0 max-h-[calc(100dvh-2rem)]'
const HEADER = 'shrink-0 px-4 pt-4 flex items-center gap-2'
const TITLE = 'text-chat-text-hi text-sm font-semibold m-0 flex-1 min-w-0'
const BODY = 'flex-1 min-h-0 min-w-0 p-4 overflow-x-auto overflow-y-auto'
const FOOTER = 'shrink-0 px-4 pb-4'
const CONTENT_SIZE = {
  md: 'w-90',
  lg: 'w-[min(34rem,calc(100vw-2rem))]',
  xl: 'w-[min(75rem,calc(100vw-2rem))]',
}

function Root(props: ComponentProps<typeof Ark.Root>): JSX.Element {
  return <Ark.Root {...props} />
}

function LayerPortal(props: {children: JSX.Element}): JSX.Element {
  const environment = useEnvironmentContext()
  const mount = (): Node => {
    const root = environment().getRootNode()
    return isShadowRoot(root) ? root : environment().getDocument().body
  }
  return <SolidPortal mount={mount()}>{props.children}</SolidPortal>
}

function Layer(props: ComponentProps<'div'>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <div {...rest} class={`${LAYER}  ${local.class ?? ''}`} />
}

function Backdrop(props: ComponentProps<typeof Ark.Backdrop>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Backdrop {...rest} class={`${BACKDROP}  ${local.class ?? ''}`} />
}

function Positioner(props: ComponentProps<typeof Ark.Positioner>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Positioner {...rest} class={`${POSITIONER}  ${local.class ?? ''}`} />
}

function Content(props: ComponentProps<typeof Ark.Content> & {size?: 'md' | 'lg' | 'xl'}): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'size', 'children'])
  return (
    <Ark.Content
      aria-modal="true"
      {...rest}
      class={`${CONTENT_SIZE[local.size ?? 'md']}  ${CONTENT_BASE}  ${local.class ?? ''}`}
    >
      <div class={SHELL}>{local.children}</div>
    </Ark.Content>
  )
}

function Header(props: ComponentProps<'div'>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <div {...rest} class={`${HEADER}  ${local.class ?? ''}`} />
}

function Title(props: ComponentProps<typeof Ark.Title>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <Ark.Title {...rest} class={`${TITLE}  ${local.class ?? ''}`} />
}

function Body(props: ComponentProps<'div'>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <div {...rest} class={`${BODY}  ${local.class ?? ''}`} />
}

function Footer(props: ComponentProps<'div'>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <div {...rest} class={`${FOOTER}  ${local.class ?? ''}`} />
}

function CloseTrigger(props: Omit<ComponentProps<typeof Ark.CloseTrigger>, 'asChild' | 'children'>): JSX.Element {
  const [local, rest] = splitProps(props, ['aria-label', 'class'])
  return (
    <Ark.CloseTrigger
      {...rest}
      aria-label={local['aria-label'] ?? 'Close'}
      asChild={(triggerProps) => (
        <Button {...triggerProps()} variant="ghost" size="icon" class={`shrink-0 ${local.class ?? ''}`}>
          <X size={16} aria-hidden="true" />
        </Button>
      )}
    />
  )
}

type DialogName = {title: string; label?: never} | {label: string; title?: never}

function ReadyMadeDialog(
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
    <Root
      open={props.open}
      onOpenChange={(details) => props.onOpenChange?.(details.open)}
      role={props.role ?? 'dialog'}
      modal={false}
      trapFocus
      closeOnEscape={props.dismissable ?? false}
      closeOnInteractOutside={props.dismissable ?? false}
      initialFocusEl={props.initialFocus}
      restoreFocus={props.restoreFocus ?? true}
    >
      <LayerPortal>
        <Backdrop />
        <Positioner>
          <Content size={props.size} aria-label={props.title === undefined ? props.label : undefined}>
            <Show when={props.title}>
              {(title) => (
                <Header>
                  <Title>{title()}</Title>
                </Header>
              )}
            </Show>
            <Body>{props.children}</Body>
            <Show when={props.footer}>{(footer) => <Footer>{footer()}</Footer>}</Show>
          </Content>
        </Positioner>
      </LayerPortal>
    </Root>
  )
}

export const Dialog = Object.assign(ReadyMadeDialog, Ark, {
  Root,
  Portal: LayerPortal,
  Layer,
  Backdrop,
  Positioner,
  Content,
  Title,
  Header,
  Body,
  Footer,
  CloseTrigger,
})

export type DialogApi = typeof ReadyMadeDialog
