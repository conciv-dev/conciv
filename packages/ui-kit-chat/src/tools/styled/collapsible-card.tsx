import {children, Show, splitProps, type JSX} from 'solid-js'
import {ChevronDown} from 'lucide-solid'
import {Collapsible, Tooltip} from '@conciv/ui-kit-system'
import {useOptionalThreadViewport} from '../../primitives/thread/viewport-context.js'

export type CollapsibleCardProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  tooltip?: string
  class?: string
}

const CARD =
  'w-full min-w-0 rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] overflow-hidden'
const ROW =
  'w-full flex items-center gap-2 px-3 py-2 text-start text-[length:var(--chat-text-md)] text-[color:var(--chat-text-2)]'
const TRIGGER = `group ${ROW} cursor-pointer select-none [background:transparent] [transition:background_140ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] focus-visible:[outline:0.125rem_solid_var(--chat-accent)] [outline-offset:-2px]`
const CHEVRON =
  'shrink-0 text-[color:var(--chat-text-3)] [transition:rotate_150ms_var(--chat-ease)] group-data-[state=closed]:-rotate-90 group-data-[state=open]:rotate-0'
const BODY = 'px-3 pt-0.5 pb-2.5 text-[length:var(--chat-text-md)] text-[color:var(--chat-text-2)]'
const HEADER_SLOT = 'flex flex-1 gap-2 min-w-0 items-center'

function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasContent)
  return value !== undefined && value !== null && value !== false && value !== ''
}

function TriggerBody(props: {header: JSX.Element}): JSX.Element {
  return (
    <>
      <span class={HEADER_SLOT}>{props.header}</span>
      <ChevronDown size={14} class={CHEVRON} aria-hidden="true" />
    </>
  )
}

function CardFrame(props: {class: string | undefined; children: JSX.Element}): JSX.Element {
  return <div class={`${CARD}  ${props.class ?? ''}`}>{props.children}</div>
}

function StaticRow(props: {tooltip: string | undefined; header: JSX.Element}): JSX.Element {
  return (
    <Show
      when={props.tooltip}
      fallback={
        <div class={ROW}>
          <span class={HEADER_SLOT}>{props.header}</span>
        </div>
      }
    >
      {(tooltip) => (
        <Tooltip.Root openDelay={400} unmountOnExit lazyMount>
          <Tooltip.Trigger
            asChild={(triggerProps) => (
              <div {...triggerProps()} class={ROW}>
                <span class={HEADER_SLOT}>{props.header}</span>
              </div>
            )}
          />
          <Tooltip.Positioner>
            <Tooltip.Content>{tooltip()}</Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
      )}
    </Show>
  )
}

function CardTrigger(props: {tooltip: string | undefined; header: JSX.Element}): JSX.Element {
  return (
    <Show
      when={props.tooltip}
      fallback={
        <Collapsible.Trigger class={TRIGGER}>
          <TriggerBody header={props.header} />
        </Collapsible.Trigger>
      }
    >
      {(tooltip) => (
        <Tooltip.Root openDelay={400} unmountOnExit lazyMount>
          <Tooltip.Trigger
            asChild={(triggerProps) => (
              <Collapsible.Trigger {...triggerProps()} class={TRIGGER}>
                <TriggerBody header={props.header} />
              </Collapsible.Trigger>
            )}
          />
          <Tooltip.Positioner>
            <Tooltip.Content>{tooltip()}</Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
      )}
    </Show>
  )
}

export function CollapsibleCard(
  props: CollapsibleCardProps & {header: JSX.Element; children?: JSX.Element},
): JSX.Element {
  const [local] = splitProps(props, ['open', 'onOpenChange', 'defaultOpen', 'tooltip', 'class', 'header', 'children'])
  const viewport = useOptionalThreadViewport()
  const body = children(() => local.children)
  return (
    <Show
      when={hasContent(body())}
      fallback={
        <CardFrame class={local.class}>
          <StaticRow tooltip={local.tooltip} header={local.header} />
        </CardFrame>
      }
    >
      <Collapsible.Root
        open={local.open}
        defaultOpen={local.defaultOpen}
        onOpenChange={(details) => {
          viewport?.holdPosition()
          local.onOpenChange?.(details.open)
        }}
      >
        <CardFrame class={local.class}>
          <CardTrigger tooltip={local.tooltip} header={local.header} />
          <Collapsible.Content>
            <div class={BODY}>{body()}</div>
          </Collapsible.Content>
        </CardFrame>
      </Collapsible.Root>
    </Show>
  )
}
