import {createMemo, createSignal, Index, Show, splitProps, type Component, type JSX, type ParentProps} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {UIMessage} from '@tanstack/ai-client'
import {Primitive, type Slottable} from '../util/primitive.js'
import {useChatContext, useComposer, useThread} from '../../store/chat-context.js'
import {pairResults, type Turn} from '../../store/grouping.js'
import {MessageProvider} from '../message/message-context.js'
import {SuggestionProvider, type SuggestionData} from '../suggestion/suggestion.js'
import {ViewportProvider, useThreadViewport} from './viewport-context.js'

type DivProps = JSX.HTMLAttributes<HTMLDivElement> & Slottable<JSX.HTMLAttributes<HTMLDivElement>>

function Root(props: DivProps): JSX.Element {
  return <Primitive.div {...props} />
}

type ViewportProps = DivProps & {
  autoScroll?: boolean
  turnAnchor?: 'top' | 'bottom'
}

function Viewport(props: ViewportProps): JSX.Element {
  const chat = useChatContext()
  const [local, rest] = splitProps(props, ['autoScroll', 'turnAnchor', 'onScroll'])
  const [isAtBottom, setIsAtBottom] = createSignal(true)
  let element: HTMLDivElement | undefined
  const recompute = () => {
    if (!element) return
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40
    setIsAtBottom(atBottom)
    chat.setView('viewport', 'isAtBottom', atBottom)
  }
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (element) element.scrollTo({top: element.scrollHeight, behavior})
  }
  return (
    <ViewportProvider value={{isAtBottom, scrollToBottom}}>
      <Primitive.div
        ref={(node) => {
          element = node
        }}
        onScroll={(event) => {
          recompute()
          if (typeof local.onScroll === 'function') local.onScroll(event)
        }}
        {...rest}
      />
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

function ScrollToBottom(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const viewport = useThreadViewport()
  return (
    <Show when={!viewport.isAtBottom()}>
      <button type="button" aria-label="Scroll to bottom" onClick={() => viewport.scrollToBottom()} {...props} />
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
  ScrollToBottom,
  Suggestion,
  Suggestions,
  Empty,
  If,
})
