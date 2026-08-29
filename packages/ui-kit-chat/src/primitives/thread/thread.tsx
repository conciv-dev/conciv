import {
  createMemo,
  createSignal,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
  splitProps,
  type Accessor,
  type Component,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {createStore} from 'solid-js/store'
import {createResizeObserver} from '@solid-primitives/resize-observer'
import type {UIMessage} from '@tanstack/ai-client'
import {Primitive, type Slottable} from '../util/primitive.js'
import {useChatContext, useComposer, useThread} from '../../store/chat-context.js'
import {pairResults, type Turn} from '../../store/grouping.js'
import {MessageProvider} from '../message/message-context.js'
import {SuggestionProvider, type SuggestionData} from '../suggestion/suggestion.js'
import {
  ViewportProvider,
  useThreadViewport,
  useOptionalThreadViewport,
  useSendFromUser,
  type ThreadScroller,
  type ViewportContextValue,
} from './viewport-context.js'
import {ViewportInternalProvider, useViewportInternal, type ViewportInternalValue} from './viewport-internal.js'
import {createThreadVirtualizer} from '../../behaviors/create-thread-virtualizer.js'
import {useTurnEstimator, type TurnEstimate} from './turn-estimate.js'
import {VIRTUALIZE_THRESHOLD} from './virtualize-threshold.js'

const ROW_ESTIMATE_PX = 72
const EVICTING_OVERSCAN = 8

type DivProps = JSX.HTMLAttributes<HTMLDivElement> & Slottable<JSX.HTMLAttributes<HTMLDivElement>>

function Root(props: DivProps): JSX.Element {
  const [scroller, setScroller] = createSignal<ThreadScroller>()
  const landOnEnd = () => scroller()?.landOnEnd()
  return (
    <ViewportProvider
      value={{
        isAtBottom: () => scroller()?.atEnd() ?? true,
        scrollToBottom: landOnEnd,
        sendFromUser: (deliver) => {
          landOnEnd()
          return deliver()
        },
        setScroller,
      }}
    >
      <Primitive.div {...props} />
    </ViewportProvider>
  )
}

type ViewportProps = DivProps & {
  footer?: JSX.Element
  ref?: HTMLDivElement | ((element: HTMLDivElement) => void)
}

function Viewport(props: ViewportProps): JSX.Element {
  const [local, rest] = splitProps(props, ['footer', 'ref'])
  const viewport = useThreadViewport()
  const [element, setElement] = createSignal<HTMLDivElement>()
  const assignRef = (node: HTMLDivElement) => {
    setElement(node)
    if (typeof local.ref === 'function') local.ref(node)
  }
  const internal: ViewportInternalValue = {element}
  return (
    <ViewportInternalProvider value={internal}>
      <Primitive.div
        data-thread-viewport
        data-at-bottom={viewport.isAtBottom() ? '' : undefined}
        ref={assignRef}
        {...rest}
      />
      {local.footer}
    </ViewportInternalProvider>
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

function PlainMessages(props: {messages: MessagesProps}): JSX.Element {
  const thread = useThread()
  const turns = () => thread.turns
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
  viewport: ViewportContextValue
}): JSX.Element {
  const thread = useThread()
  const turns = () => thread.turns
  const estimator = useTurnEstimator()
  const [spacer, setSpacer] = createSignal<HTMLDivElement>()
  const [metrics, setMetrics] = createStore({gap: 0, scrollMargin: 0})
  const settledEstimate = (index: number): TurnEstimate | undefined => {
    if (index === turns().length - 1) return undefined
    const turn = turns()[index]
    if (!turn) return undefined
    return estimator?.estimateTurn(turn)
  }
  const measureViewportMetrics = (): void => {
    const viewport = props.internal.element()
    const node = spacer()
    if (!viewport || !node) return
    setMetrics({
      gap: Number.parseFloat(getComputedStyle(viewport).rowGap) || 0,
      scrollMargin: node.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop,
    })
  }
  const virtualizer = createThreadVirtualizer({
    scrollElement: () => props.internal.element(),
    count: () => turns().length,
    keyAt: (index) => turns()[index]?.key,
    estimateSizeAt: (index) => settledEstimate(index)?.height ?? ROW_ESTIMATE_PX,
    exactAt: (index) => settledEstimate(index)?.exact === true,
    gap: () => metrics.gap,
    scrollMargin: () => metrics.scrollMargin,
    overscan: () => (turns().length < VIRTUALIZE_THRESHOLD ? turns().length : EVICTING_OVERSCAN),
  })
  onMount(() => {
    props.viewport.setScroller({atEnd: virtualizer.atEnd, landOnEnd: virtualizer.landOnEnd})
    onCleanup(() => props.viewport.setScroller(undefined))
    let disposed = false
    onCleanup(() => {
      disposed = true
    })
    let pendingRefreshFrame: number | undefined
    onCleanup(() => {
      if (pendingRefreshFrame !== undefined) cancelAnimationFrame(pendingRefreshFrame)
    })
    const scheduleEstimateRefresh = (): void => {
      if (pendingRefreshFrame !== undefined) return
      pendingRefreshFrame = requestAnimationFrame(() => {
        pendingRefreshFrame = undefined
        if (disposed || !estimator) return
        estimator.reset()
        virtualizer.remeasure()
      })
    }
    void document.fonts.ready.then(() => {
      if (disposed) return
      scheduleEstimateRefresh()
    })
    const viewport = props.internal.element()
    if (viewport) {
      measureViewportMetrics()
      let lastWidth = viewport.clientWidth
      createResizeObserver(viewport, ({width}) => {
        measureViewportMetrics()
        if (width === lastWidth) return
        lastWidth = width
        scheduleEstimateRefresh()
      })
      const previousAnchoring = viewport.style.overflowAnchor
      viewport.style.overflowAnchor = 'none'
      onCleanup(() => {
        viewport.style.overflowAnchor = previousAnchoring
      })
    }
  })
  return (
    <div
      ref={setSpacer}
      style={{position: 'relative', width: '100%', flex: 'none', height: `${virtualizer.totalSize()}px`}}
    >
      <For each={virtualizer.items}>
        {(item) => (
          <div
            ref={(element) =>
              queueMicrotask(() => {
                if (settledEstimate(item.index)?.exact !== true) virtualizer.measureRow(element)
              })
            }
            data-index={item.index}
            style={{
              position: 'absolute',
              top: '0',
              left: '0',
              width: '100%',
              display: 'flex',
              'flex-direction': 'column',
              transform: `translateY(${item.start - metrics.scrollMargin}px)`,
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
  const internal = useViewportInternal()
  const viewport = useOptionalThreadViewport()
  const virtualizable = () => (internal && viewport ? {internal, viewport} : undefined)
  return (
    <Show when={virtualizable()} fallback={<PlainMessages messages={props} />}>
      {(resolved) => <VirtualMessages messages={props} internal={resolved().internal} viewport={resolved().viewport} />}
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

function ScrollToBottom(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const viewport = useThreadViewport()
  return (
    <button
      type="button"
      aria-label="Scroll to bottom"
      {...props}
      disabled={viewport.isAtBottom()}
      data-at-bottom={viewport.isAtBottom() ? '' : undefined}
      onClick={() => viewport.scrollToBottom()}
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
  const sendFromUser = useSendFromUser()
  const [local, rest] = splitProps(props, ['prompt', 'send', 'clearComposer'])
  const activate = () => {
    if (local.clearComposer !== false) composer.setText('')
    if (local.send) {
      const prompt = local.prompt
      void sendFromUser(() => chat.sendMessage(prompt))
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
