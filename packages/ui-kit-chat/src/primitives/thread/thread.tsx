import {
  createComputed,
  createMemo,
  createSignal,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
  splitProps,
  untrack,
  type Accessor,
  type Component,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {UIMessage} from '@tanstack/ai-client'
import {Primitive, type Slottable} from '../util/primitive.js'
import {useChatContext, useComposer, useThread} from '../../store/chat-context.js'
import {pairResults, type Turn} from '../../store/grouping.js'
import {MessageProvider} from '../message/message-context.js'
import {SuggestionProvider, type SuggestionData} from '../suggestion/suggestion.js'
import {ViewportProvider, useThreadViewport} from './viewport-context.js'
import {
  ViewportInternalProvider,
  useViewportInternal,
  type ThreadVirtualScroll,
  type ViewportInternalValue,
} from './viewport-internal.js'
import {useThreadScroll} from '../../behaviors/use-thread-scroll.js'
import {createThreadVirtualizer} from '../../behaviors/create-thread-virtualizer.js'

const VIRTUALIZE_THRESHOLD = 50
const ROW_ESTIMATE_PX = 120

type DivProps = JSX.HTMLAttributes<HTMLDivElement> & Slottable<JSX.HTMLAttributes<HTMLDivElement>>

function Root(props: DivProps): JSX.Element {
  return <Primitive.div {...props} />
}

type ViewportProps = DivProps & {
  autoScroll?: boolean
  turnAnchor?: 'top' | 'bottom'
  topAnchorMessageClamp?: {tallerThan?: string; visibleHeight?: string}
  scrollToBottomOnRunStart?: boolean
  scrollToBottomOnInitialize?: boolean
  scrollToBottomOnThreadSwitch?: boolean
  ref?: HTMLDivElement | ((element: HTMLDivElement) => void)
}

function Viewport(props: ViewportProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'autoScroll',
    'turnAnchor',
    'topAnchorMessageClamp',
    'scrollToBottomOnRunStart',
    'scrollToBottomOnInitialize',
    'scrollToBottomOnThreadSwitch',
    'ref',
  ])
  const [element, setElement] = createSignal<HTMLDivElement>()
  const [virtualScroll, setVirtualScroll] = createSignal<ThreadVirtualScroll>()
  const scroll = useThreadScroll(element, local, virtualScroll)
  const assignRef = (node: HTMLDivElement) => {
    setElement(node)
    if (typeof local.ref === 'function') local.ref(node)
  }
  const internal: ViewportInternalValue = {
    element,
    turnAnchor: () => local.turnAnchor ?? 'bottom',
    isAtBottom: scroll.isAtBottom,
    ownsViewport: () => scroll.isAtBottom() && scroll.follows(),
    pinToBottom: scroll.pinToBottom,
    setVirtualScroll,
  }
  return (
    <ViewportProvider
      value={{isAtBottom: scroll.isAtBottom, scrollToBottom: scroll.scrollToBottom, pauseFollow: scroll.pauseFollow}}
    >
      <ViewportInternalProvider value={internal}>
        <Primitive.div
          data-thread-viewport
          data-at-bottom={scroll.isAtBottom() ? '' : undefined}
          data-escaped={scroll.escapedFromLock() ? '' : undefined}
          ref={assignRef}
          {...rest}
        />
      </ViewportInternalProvider>
    </ViewportProvider>
  )
}

function ViewportFooter(props: DivProps): JSX.Element {
  return <Primitive.div {...props} />
}

export type MessagesComponents = {UserMessage?: Component; AssistantMessage?: Component; SystemMessage?: Component}

type MessagesProps =
  | {components: MessagesComponents; children?: never}
  | {children: (message: () => UIMessage) => JSX.Element; components?: never}

function componentForRole(role: Turn['role'], components: MessagesComponents): Component | undefined {
  if (role === 'user') return components.UserMessage
  if (role === 'assistant') return components.AssistantMessage
  return components.SystemMessage
}

type TurnSlotProps = {
  turn: Accessor<Turn | undefined>
  index: Accessor<number>
  total: Accessor<number>
  messages: MessagesProps
}

function TurnSlot(props: TurnSlotProps): JSX.Element {
  return (
    <Show when={props.turn()}>
      {(turn) => {
        const pairing = createMemo(() => pairResults(turn().parts))
        const isLast = () => props.index() === props.total() - 1
        const components = 'components' in props.messages ? props.messages.components : undefined
        const component = () => (components ? componentForRole(turn().role, components) : undefined)
        return (
          <MessageProvider value={{message: turn, index: props.index, pairing, isLast}}>
            <Show
              when={component()}
              fallback={
                'children' in props.messages && props.messages.children
                  ? props.messages.children(() => toMessage(turn()))
                  : null
              }
            >
              {(resolved) => <Dynamic component={resolved()} />}
            </Show>
          </MessageProvider>
        )
      }}
    </Show>
  )
}

type CapturedAnchor = {kind: 'bottom'} | {kind: 'anchor'; key: string; offset: number}

function captureAnchor(internal: ViewportInternalValue | undefined): CapturedAnchor | undefined {
  if (!internal) return undefined
  if (internal.isAtBottom()) return {kind: 'bottom'}
  const viewport = internal.element()
  if (!viewport) return undefined
  const viewportTop = viewport.getBoundingClientRect().top
  const rows = Array.from(viewport.querySelectorAll('[data-message-id]'))
  const anchorRow = rows.find((row) => row.getBoundingClientRect().bottom > viewportTop)
  const key = anchorRow?.getAttribute('data-message-id')
  if (!anchorRow || !key) return undefined
  return {kind: 'anchor', key, offset: anchorRow.getBoundingClientRect().top - viewportTop}
}

function FlatMessages(props: {
  messages: MessagesProps
  internal: ViewportInternalValue | undefined
  anchor: CapturedAnchor | undefined
}): JSX.Element {
  const thread = useThread()
  const turns = () => thread.turns
  onMount(() => {
    const anchor = props.anchor
    const internal = props.internal
    if (!anchor || !internal) return
    if (anchor.kind === 'bottom') {
      internal.pinToBottom()
      return
    }
    const viewport = internal.element()
    const row = viewport?.querySelector(`[data-message-id="${CSS.escape(anchor.key)}"]`)
    if (!viewport || !row) return
    const currentOffset = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top
    viewport.scrollTop += currentOffset - anchor.offset
  })
  return (
    <Index each={turns()}>
      {(turn, index) => (
        <TurnSlot turn={turn} index={() => index} total={() => turns().length} messages={props.messages} />
      )}
    </Index>
  )
}

function VirtualMessages(props: {
  messages: MessagesProps
  internal: ViewportInternalValue
  anchor: CapturedAnchor | undefined
}): JSX.Element {
  const thread = useThread()
  const turns = () => thread.turns
  const [gap, setGap] = createSignal(0)
  const virtualizer = createThreadVirtualizer({
    scrollElement: () => props.internal.element(),
    count: () => turns().length,
    keyAt: (index) => turns()[index]?.key ?? `${index}`,
    estimateSize: ROW_ESTIMATE_PX,
    gap,
    ownsViewport: () => props.internal.ownsViewport(),
  })
  onMount(() => {
    props.internal.setVirtualScroll({scrollToLast: virtualizer.scrollToLast})
    onCleanup(() => props.internal.setVirtualScroll(undefined))
    const viewport = props.internal.element()
    if (viewport) {
      setGap(Number.parseFloat(getComputedStyle(viewport).rowGap) || 0)
      const previousAnchoring = viewport.style.overflowAnchor
      viewport.style.overflowAnchor = 'none'
      onCleanup(() => {
        viewport.style.overflowAnchor = previousAnchoring
      })
    }
    const anchor = props.anchor
    if (anchor?.kind === 'anchor') {
      const index = turns().findIndex((turn) => turn.key === anchor.key)
      if (index >= 0) {
        virtualizer.scrollToAnchor(index, anchor.offset)
        return
      }
    }
    props.internal.pinToBottom()
  })
  return (
    <div style={{position: 'relative', width: '100%', height: `${virtualizer.totalSize()}px`}}>
      <For each={virtualizer.items}>
        {(item) => (
          <div
            ref={virtualizer.measureRow}
            data-index={item.index}
            style={{
              position: 'absolute',
              top: '0',
              left: '0',
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          >
            <TurnSlot
              turn={() => turns()[item.index]}
              index={() => item.index}
              total={() => turns().length}
              messages={props.messages}
            />
          </div>
        )}
      </For>
    </div>
  )
}

function Messages(props: MessagesProps): JSX.Element {
  const thread = useThread()
  const internal = useViewportInternal()
  const eligible = () =>
    internal !== undefined && internal.turnAnchor() === 'bottom' && thread.turns.length >= VIRTUALIZE_THRESHOLD
  const [mode, setMode] = createSignal<'flat' | 'virtual'>(untrack(eligible) ? 'virtual' : 'flat')
  const [anchor, setAnchor] = createSignal<CapturedAnchor>()
  createComputed(() => {
    const next = eligible() ? 'virtual' : 'flat'
    if (next === untrack(mode)) return
    setAnchor(captureAnchor(internal))
    setMode(next)
  })
  return (
    <Show
      when={mode() === 'virtual' ? internal : undefined}
      fallback={<FlatMessages messages={props} internal={internal} anchor={anchor()} />}
    >
      {(resolved) => <VirtualMessages messages={props} internal={resolved()} anchor={anchor()} />}
    </Show>
  )
}

function toMessage(turn: Turn): UIMessage {
  return {id: turn.key, role: turn.role, parts: turn.parts}
}

type MessageByIndexProps = {index: number; components: MessagesComponents}

function MessageByIndex(props: MessageByIndexProps): JSX.Element {
  const thread = useThread()
  const turn = () => thread.turns[props.index]
  return (
    <Show when={turn()} keyed>
      {(value) => {
        const pairing = createMemo(() => pairResults(value.parts))
        const isLast = () => props.index === thread.turns.length - 1
        const component = componentForRole(value.role, props.components)
        return (
          <MessageProvider value={{message: () => value, index: () => props.index, pairing, isLast}}>
            <Show when={component}>{(resolved) => <Dynamic component={resolved()} />}</Show>
          </MessageProvider>
        )
      }}
    </Show>
  )
}

type MessageByIdProps = {messageId: string; components: MessagesComponents}

function Unstable_MessageById(props: MessageByIdProps): JSX.Element {
  const thread = useThread()
  const located = () => {
    const index = thread.turns.findIndex((turn) => turn.key === props.messageId)
    const turn = thread.turns[index]
    return turn ? {turn, index} : undefined
  }
  return (
    <Show when={located()} keyed>
      {(value) => {
        const pairing = createMemo(() => pairResults(value.turn.parts))
        const isLast = () => value.index === thread.turns.length - 1
        const component = componentForRole(value.turn.role, props.components)
        return (
          <MessageProvider value={{message: () => value.turn, index: () => value.index, pairing, isLast}}>
            <Show when={component}>{(resolved) => <Dynamic component={resolved()} />}</Show>
          </MessageProvider>
        )
      }}
    </Show>
  )
}

function ScrollToBottom(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {behavior?: ScrollBehavior}): JSX.Element {
  const viewport = useThreadViewport()
  const [local, rest] = splitProps(props, ['behavior'])
  return (
    <button
      type="button"
      aria-label="Scroll to bottom"
      {...rest}
      disabled={viewport.isAtBottom()}
      data-at-bottom={viewport.isAtBottom() ? '' : undefined}
      onClick={() => viewport.scrollToBottom(local.behavior ?? 'smooth')}
    />
  )
}

type SuggestionProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  prompt: string
  send?: boolean
  clearComposer?: boolean
}

function Suggestion(props: SuggestionProps): JSX.Element {
  const chat = useChatContext()
  const composer = useComposer()
  const [local, rest] = splitProps(props, ['prompt', 'send', 'clearComposer'])
  const activate = () => {
    if (local.clearComposer !== false) composer.setText('')
    if (local.send) {
      void chat.sendMessage(local.prompt)
      return
    }
    composer.setText(local.prompt)
  }
  return <button type="button" onClick={activate} {...rest} />
}

type SuggestionsProps =
  | {components: {Suggestion: Component}; each: SuggestionData[]; children?: never}
  | {children: (suggestion: () => SuggestionData) => JSX.Element; each: SuggestionData[]; components?: never}

function Suggestions(props: SuggestionsProps): JSX.Element {
  const itemComponent = () => ('components' in props && props.components ? props.components.Suggestion : undefined)
  const renderChildren = () => ('children' in props ? props.children : undefined)
  return (
    <Index each={props.each}>
      {(suggestion) => (
        <SuggestionProvider value={suggestion}>
          <Show when={itemComponent()} fallback={renderChildren()?.(suggestion) ?? null}>
            {(component) => <Dynamic component={component()} />}
          </Show>
        </SuggestionProvider>
      )}
    </Index>
  )
}

function Empty(props: ParentProps): JSX.Element {
  const thread = useThread()
  return <Show when={thread.isEmpty}>{props.children}</Show>
}

type IfProps = ParentProps<{empty?: boolean; running?: boolean; disabled?: boolean}>

function If(props: IfProps): JSX.Element {
  const thread = useThread()
  const matches = () => {
    const checks: boolean[] = []
    if (props.empty !== undefined) checks.push(thread.isEmpty === props.empty)
    if (props.running !== undefined) checks.push(thread.isRunning === props.running)
    if (props.disabled !== undefined) checks.push(thread.isDisabled === props.disabled)
    return checks.every(Boolean)
  }
  return <Show when={matches()}>{props.children}</Show>
}

export const Thread = Object.assign(Root, {
  Root,
  Viewport,
  ViewportFooter,
  Messages,
  MessageByIndex,
  Unstable_MessageById,
  ScrollToBottom,
  Suggestion,
  Suggestions,
  Empty,
  If,
})
