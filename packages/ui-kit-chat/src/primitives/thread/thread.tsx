import {createMemo, createSignal, Index, Show, splitProps, type Component, type JSX, type ParentProps} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {UIMessage} from '@tanstack/ai-client'
import {Primitive, type Slottable} from '../util/primitive.js'
import {useChatContext, useComposer, useThread} from '../../store/chat-context.js'
import {pairResults, type Turn} from '../../store/grouping.js'
import {MessageProvider} from '../message/message-context.js'
import {SuggestionProvider, type SuggestionData} from '../suggestion/suggestion.js'
import {ViewportProvider, useThreadViewport} from './viewport-context.js'
import {useThreadScroll} from '../../behaviors/use-thread-scroll.js'

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
}

function Viewport(props: ViewportProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'autoScroll',
    'turnAnchor',
    'topAnchorMessageClamp',
    'scrollToBottomOnRunStart',
    'scrollToBottomOnInitialize',
    'scrollToBottomOnThreadSwitch',
  ])
  const [element, setElement] = createSignal<HTMLDivElement>()
  const {isAtBottom, scrollToBottom} = useThreadScroll(element, local)
  return (
    <ViewportProvider value={{isAtBottom, scrollToBottom}}>
      <Primitive.div data-thread-viewport ref={(node) => setElement(node)} {...rest} />
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

function Messages(props: MessagesProps): JSX.Element {
  const thread = useThread()
  const turns = () => thread.turns
  return (
    <Index each={turns()}>
      {(turn, index) => {
        const pairing = createMemo(() => pairResults(turn().parts))
        const isLast = () => index === turns().length - 1
        const components = 'components' in props ? props.components : undefined
        const component = () => (components ? componentForRole(turn().role, components) : undefined)
        return (
          <MessageProvider value={{message: turn, index: () => index, pairing, isLast}}>
            <Show
              when={component()}
              fallback={'children' in props && props.children ? props.children(() => toMessage(turn())) : null}
            >
              {(resolved) => <Dynamic component={resolved()} />}
            </Show>
          </MessageProvider>
        )
      }}
    </Index>
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
    <Show when={!viewport.isAtBottom()}>
      <button
        type="button"
        aria-label="Scroll to bottom"
        onClick={() => viewport.scrollToBottom(local.behavior ?? 'smooth')}
        {...rest}
      />
    </Show>
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
  const renderChildren = 'children' in props ? props.children : undefined
  return (
    <Index each={props.each}>
      {(suggestion) => (
        <SuggestionProvider value={suggestion()}>
          <Show when={itemComponent()} fallback={renderChildren ? renderChildren(suggestion) : null}>
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
