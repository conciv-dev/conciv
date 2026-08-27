import {createContext, Show, useContext, type Accessor, type JSX, type ParentProps} from 'solid-js'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import Loader from 'lucide-solid/icons/loader'
import {Collapsible} from '@conciv/ui-kit-system'
import {createSettleFold} from '../primitives/util/create-settle-fold.js'
import {useScrollLock} from '../behaviors/use-scroll-lock.js'
import {usePauseFollowOnToggle} from '../behaviors/use-follow-pause.js'
import {useOptionalThreadViewport} from '../primitives/thread/viewport-context.js'
import {SHIMMER} from './shimmer.js'
import {FOCUS, SPIN} from './classes.js'

const ANIMATION_DURATION_MS = 200

const ROOT = 'flex flex-col min-w-0 w-full'
const TRIGGER = `group flex items-center gap-2 w-full px-3 py-2 text-[length:var(--chat-text-md)] text-chat-text-2 cursor-pointer select-none [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] rounded-[var(--chat-radius-md)] [transition:background_140ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] ${FOCUS}`
const CHEVRON =
  'ml-auto shrink-0 text-chat-text-3 [transition:rotate_150ms_var(--chat-ease)] group-data-[state=closed]:-rotate-90 group-data-[state=open]:rotate-0'

const PLURAL_RULES = new Intl.PluralRules('en')

function countLabel(label: string, count: number): string {
  return `${count} ${label}${PLURAL_RULES.select(count) === 'one' ? '' : 's'}`
}

type GroupState = {streaming: Accessor<boolean>}

const GroupContext = createContext<GroupState>({streaming: () => false})

const GroupContentRef = createContext<(element: HTMLDivElement) => void>(() => {})

export type GroupRootProps = ParentProps<{
  streaming?: boolean
  autoOpen?: boolean
  folded?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  class?: string
}>

export type GroupTriggerProps = {
  label: string
  icon?: JSX.Element
  count?: number
  iconSize?: number
  class?: string
}

export type GroupContentProps = ParentProps<{class?: string}>

function Root(props: GroupRootProps): JSX.Element {
  const fold = createSettleFold({
    revealed: () => props.autoOpen === true,
    folded: () => props.folded ?? false,
    defaultOpen: props.defaultOpen,
  })
  const open = () => props.open ?? fold.open()
  let rootElement: HTMLDivElement | undefined
  let contentElement: HTMLDivElement | undefined
  const lockScroll = useScrollLock(() => rootElement, ANIMATION_DURATION_MS)
  const viewport = useOptionalThreadViewport()
  const settleFollow = usePauseFollowOnToggle(() => contentElement, viewport?.pauseFollow)
  const handleOpenChange = (next: boolean) => {
    lockScroll()
    settleFollow()
    fold.setOpen(next)
    props.onOpenChange?.(next)
  }
  return (
    <GroupContext.Provider value={{streaming: () => props.streaming === true}}>
      <Collapsible.Root open={open()} onOpenChange={(details) => handleOpenChange(details.open)}>
        <div ref={(element) => (rootElement = element)} class={props.class ?? ROOT}>
          <GroupContentRef.Provider value={(element) => (contentElement = element)}>
            {props.children}
          </GroupContentRef.Provider>
        </div>
      </Collapsible.Root>
    </GroupContext.Provider>
  )
}

function Trigger(props: GroupTriggerProps): JSX.Element {
  const group = useContext(GroupContext)
  const size = () => props.iconSize ?? 14
  const text = () => (props.count === undefined ? props.label : countLabel(props.label, props.count))
  return (
    <Collapsible.Trigger class={props.class ?? TRIGGER}>
      <Show when={group.streaming()} fallback={props.icon}>
        <Loader size={size()} class={SPIN} aria-hidden="true" />
      </Show>
      <span class={group.streaming() ? SHIMMER : ''}>{text()}</span>
      <ChevronDown size={size()} class={CHEVRON} aria-hidden="true" />
    </Collapsible.Trigger>
  )
}

function Content(props: GroupContentProps): JSX.Element {
  const setContentElement = useContext(GroupContentRef)
  return (
    <Collapsible.Content ref={setContentElement}>
      <div class={props.class}>{props.children}</div>
    </Collapsible.Content>
  )
}

export const Group = Object.assign(Root, {Root, Trigger, Content})
