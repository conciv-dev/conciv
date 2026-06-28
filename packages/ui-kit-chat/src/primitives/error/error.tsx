import {Show, type JSX} from 'solid-js'
import {useChatContext} from '../../store/chat-context.js'
import {Primitive} from '../util/primitive.js'

function Root(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const chat = useChatContext()
  return (
    <Show when={chat.error()}>
      <Primitive.div role="alert" {...props} />
    </Show>
  )
}

function Message(props: JSX.HTMLAttributes<HTMLSpanElement>): JSX.Element {
  const chat = useChatContext()
  return (
    <Show when={chat.error()}>
      {(error) => <Primitive.span {...props}>{props.children ?? String(error().message)}</Primitive.span>}
    </Show>
  )
}

export const Error = Object.assign(Root, {Root, Message})
