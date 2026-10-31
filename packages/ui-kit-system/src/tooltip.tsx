import {
  createContext,
  createSignal,
  createUniqueId,
  mergeProps,
  onCleanup,
  onMount,
  Show,
  splitProps,
  useContext,
  type ComponentProps,
  type JSX,
  type Setter,
} from 'solid-js'
import {Tooltip as Ark, useTooltip, useTooltipContext} from '@ark-ui/solid/tooltip'
import {useEnvironmentContext} from '@ark-ui/solid/environment'
import {makeEventListener} from '@solid-primitives/event-listener'
import {Timer, TooltipGroup, useTooltipGroup, type TooltipGroupApi, type TooltipGroupMember} from './tooltip-group.js'
import {popIn, sideFromPlacement} from './tooltip-motion.js'
import {isDocument, isHTMLElement, isShadowRoot} from './realm.js'

const CONTENT =
  'hidden data-[state=open]:block z-[2147483647] rounded-chat-surface-sm bg-chat-panel text-chat-text border border-chat-line shadow-chat-lg py-1 px-2 text-[0.6875rem] max-w-60 focus-visible:outline-none'

const LONG_PRESS = 500
const HOLD_SLOP = 10

type RootProps = ComponentProps<typeof Ark.Root>
type Hold = {phase: 'idle'} | {phase: 'holding'; x: number; y: number; pointerId: number} | {phase: 'held'}

type ContentBinding = {bind: (element: HTMLElement) => void; pop: (element: HTMLElement) => void}

const ContentRefContext = createContext<ContentBinding>()
const MemberContext = createContext<Setter<{children?: JSX.Element}>>()

function PlainRoot(props: RootProps) {
  const [local, rest] = splitProps(props, ['positioning', 'openDelay', 'closeDelay', 'onOpenChange', 'children'])
  const [content, setContent] = createSignal<HTMLElement>()
  const pop = (element: HTMLElement): void => {
    element.getAnimations().forEach((animation) => animation.cancel())
    popIn({element, side: sideFromPlacement(element.dataset.placement ?? local.positioning?.placement)})
  }
  const onOpenChange: RootProps['onOpenChange'] = (details) => {
    const element = content()
    if (details.open && element?.isConnected) pop(element)
    local.onOpenChange?.(details)
  }
  const binding: ContentBinding = {bind: setContent, pop}
  return (
    <Ark.Root
      openDelay={local.openDelay ?? 300}
      closeDelay={local.closeDelay ?? 80}
      positioning={{strategy: 'fixed', placement: 'top', gutter: 6, ...local.positioning}}
      onOpenChange={onOpenChange}
      {...rest}
    >
      <ContentRefContext.Provider value={binding}>{local.children}</ContentRefContext.Provider>
    </Ark.Root>
  )
}

function GroupRoot(props: RootProps & {group: TooltipGroupApi}) {
  const [local, rest] = splitProps(props, [
    'group',
    'positioning',
    'openDelay',
    'closeDelay',
    'onOpenChange',
    'ids',
    'children',
  ])
  const environment = useEnvironmentContext()
  const triggerId = `tooltip-trigger-${createUniqueId()}`
  const [trigger, setTrigger] = createSignal<HTMLElement>()
  const [label, setLabel] = createSignal<{children?: JSX.Element}>({})
  const [hold, setHold] = createSignal<Hold>({phase: 'idle'})
  const openDelay = () => local.openDelay ?? local.group.openDelay()
  const member: TooltipGroupMember = {
    id: triggerId,
    side: () => sideFromPlacement(local.positioning?.placement),
    gap: () => local.positioning?.gutter ?? 6,
    trigger,
    label,
    close: () => api().setOpen(false),
  }
  const machineProps = mergeProps(rest, {
    get openDelay() {
      return local.group.warm() ? 0 : openDelay()
    },
    get closeDelay() {
      return local.closeDelay ?? 80
    },
    get ids() {
      return {...local.ids, trigger: triggerId, content: local.group.labelId}
    },
    get positioning() {
      return {strategy: 'fixed' as const, placement: 'top' as const, gutter: 6, ...local.positioning}
    },
    onOpenChange: (details: {open: boolean}) => {
      if (details.open) local.group.open(member)
      if (!details.open) local.group.close(member)
      local.onOpenChange?.(details)
    },
  })
  const api = useTooltip(machineProps)

  const releaseHold = (): void => {
    if (hold().phase !== 'holding') return
    setHold({phase: 'idle'})
    local.group.disarm(member)
  }

  const fireHold = (): void => {
    setHold({phase: 'held'})
    local.group.disarm(member)
    local.group.open(member)
  }

  onMount(() => {
    const root = environment().getRootNode()
    const element = isDocument(root) || isShadowRoot(root) ? root.getElementById(triggerId) : null
    if (!isHTMLElement(element)) return
    setTrigger(element)
    makeEventListener(element, 'pointerenter', (event) => {
      if (event.pointerType === 'touch' || event.buttons !== 0 || api().open) return
      local.group.arm({member, duration: openDelay()})
    })
    makeEventListener(element, 'pointerleave', (event) => {
      if (event.pointerType !== 'touch') local.group.disarm(member)
    })
    makeEventListener(element, 'pointerdown', (event) => {
      local.group.disarm(member)
      if (event.pointerType === 'mouse') return
      setHold({phase: 'holding', x: event.clientX, y: event.clientY, pointerId: event.pointerId})
      local.group.arm({member, duration: LONG_PRESS})
    })
    makeEventListener(element, 'pointermove', (event) => {
      const current = hold()
      if (current.phase !== 'holding' || current.pointerId !== event.pointerId) return
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > HOLD_SLOP) releaseHold()
    })
    makeEventListener(element, 'pointerup', releaseHold)
    makeEventListener(element, 'pointercancel', releaseHold)
    makeEventListener(element, 'contextmenu', (event) => {
      if (hold().phase === 'holding') event.preventDefault()
    })
    makeEventListener(element, 'touchend', (event) => {
      if (hold().phase !== 'held') return
      event.preventDefault()
      setHold({phase: 'idle'})
    })
  })
  onCleanup(() => local.group.forget(member))

  return (
    <Ark.RootProvider value={api}>
      <MemberContext.Provider value={setLabel}>{local.children}</MemberContext.Provider>
      <Show when={hold().phase === 'holding'}>
        <Timer delay={LONG_PRESS} onDone={fireHold} />
      </Show>
    </Ark.RootProvider>
  )
}

function Root(props: RootProps) {
  return (
    <Show when={useTooltipGroup()} fallback={<PlainRoot {...props} />}>
      {(group) => <GroupRoot {...props} group={group()} />}
    </Show>
  )
}

function Positioner(props: ComponentProps<typeof Ark.Positioner>) {
  return (
    <Show when={useContext(MemberContext)} fallback={<Ark.Positioner {...props} />}>
      {props.children}
    </Show>
  )
}

function GroupContent(props: {register: Setter<{children?: JSX.Element}>; children?: JSX.Element}): JSX.Element {
  onMount(() => props.register(props))
  return undefined
}

function Content(props: ComponentProps<typeof Ark.Content>) {
  const binding = useContext(ContentRefContext)
  const api = useTooltipContext()
  const [local, rest] = splitProps(props, ['class', 'children', 'ref'])
  const bindContent = (element: HTMLDivElement): void => {
    binding?.bind(element)
    if (api().open) binding?.pop(element)
    if (typeof local.ref === 'function') local.ref(element)
  }
  return (
    <Show
      when={useContext(MemberContext)}
      fallback={
        <Ark.Content {...rest} ref={bindContent} class={`${CONTENT}  ${local.class ?? ''}`}>
          {local.children}
        </Ark.Content>
      }
    >
      {(register) => <GroupContent register={register()}>{local.children}</GroupContent>}
    </Show>
  )
}

export const Tooltip = Object.assign({}, Ark, {Root, Positioner, Content, Group: TooltipGroup})
