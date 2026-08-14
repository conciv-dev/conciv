import {Show, splitProps, type JSX, type Ref} from 'solid-js'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import {Collapsible, Tooltip} from '@conciv/ui-kit-system'
import {useScrollLock} from '../../behaviors/use-scroll-lock.js'
import {usePauseFollowOnToggle} from '../../behaviors/use-follow-pause.js'
import {useOptionalThreadViewport} from '../../primitives/thread/viewport-context.js'

const ANIMATION_DURATION_MS = 200

export type CollapsibleCardProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  tooltip?: string
  flush?: boolean
  class?: string
}

const CARD =
  'w-full min-w-0 rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] overflow-hidden'
const ROW =
  'w-full flex items-center gap-2 px-3 py-2 text-start text-[length:var(--chat-text-md)] text-[color:var(--chat-text-2)]'
const ROW_FLUSH =
  'w-full flex items-center gap-1.5 pe-2.5 text-start text-[length:var(--chat-text-md)] text-[color:var(--chat-text-2)] [background:var(--chat-fill)]'
const TRIGGER = `group ${ROW} cursor-pointer select-none [background:transparent] [transition:background_140ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] focus-visible:[outline:0.125rem_solid_var(--chat-accent)] [outline-offset:-2px]`
const TRIGGER_FLUSH = `group ${ROW_FLUSH} cursor-pointer select-none [transition:background_200ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] focus-visible:[outline:0.125rem_solid_var(--chat-accent)] [outline-offset:-2px]`
const CHEVRON =
  'inline-flex shrink-0 text-[color:var(--chat-text-3)] [transition:rotate_150ms_var(--chat-ease)] data-[state=closed]:-rotate-90 data-[state=open]:rotate-0'
const BODY = 'px-3 pt-0.5 pb-2.5 text-[length:var(--chat-text-md)] text-[color:var(--chat-text-2)]'
const HEADER_SLOT = 'flex flex-1 gap-2 min-w-0 items-center'

function TriggerBody(props: {header: JSX.Element}): JSX.Element {
  return (
    <>
      <span class={HEADER_SLOT}>{props.header}</span>
      <Collapsible.Indicator class={CHEVRON}>
        <ChevronDown size={14} aria-hidden="true" />
      </Collapsible.Indicator>
    </>
  )
}

function CardFrame(props: {class: string | undefined; ref?: Ref<HTMLDivElement>; children: JSX.Element}): JSX.Element {
  return (
    <div ref={props.ref} class={`${CARD}  ${props.class ?? ''}`}>
      {props.children}
    </div>
  )
}

function CardTrigger(props: {tooltip: string | undefined; flush: boolean; header: JSX.Element}): JSX.Element {
  const triggerClass = () => (props.flush ? TRIGGER_FLUSH : TRIGGER)
  return (
    <Show
      when={props.tooltip}
      fallback={
        <Collapsible.Trigger class={triggerClass()}>
          <TriggerBody header={props.header} />
        </Collapsible.Trigger>
      }
    >
      {(tooltip) => (
        <Tooltip.Root openDelay={400} unmountOnExit lazyMount>
          <Collapsible.Trigger
            asChild={(triggerProps) => (
              <Tooltip.Trigger {...triggerProps()} class={triggerClass()}>
                <TriggerBody header={props.header} />
              </Tooltip.Trigger>
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
  const [local] = splitProps(props, [
    'open',
    'onOpenChange',
    'defaultOpen',
    'tooltip',
    'flush',
    'class',
    'header',
    'children',
  ])
  const flush = () => local.flush === true
  let cardEl: HTMLDivElement | undefined
  let contentEl: HTMLDivElement | undefined
  const lockScroll = useScrollLock(() => cardEl, ANIMATION_DURATION_MS)
  const viewport = useOptionalThreadViewport()
  const settleFollow = usePauseFollowOnToggle(() => contentEl, viewport?.pauseFollow)
  const handleOpenChange = (open: boolean) => {
    lockScroll()
    settleFollow()
    local.onOpenChange?.(open)
  }
  return (
    <Collapsible.Root
      open={local.open}
      defaultOpen={local.defaultOpen}
      onOpenChange={(details) => handleOpenChange(details.open)}
    >
      <CardFrame class={local.class} ref={(el) => (cardEl = el)}>
        <CardTrigger tooltip={local.tooltip} flush={flush()} header={local.header} />
        <Collapsible.Content ref={(el) => (contentEl = el)}>
          <div class={BODY}>{local.children}</div>
        </Collapsible.Content>
      </CardFrame>
    </Collapsible.Root>
  )
}
