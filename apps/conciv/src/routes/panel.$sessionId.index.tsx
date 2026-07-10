import {createFileRoute} from '@tanstack/solid-router'
import {Show, type JSX} from 'solid-js'
import {ChatPane} from '../chat/chat-pane.js'

export const Route = createFileRoute('/panel/$sessionId/')({component: ChatPaneRoute})

function ChatPaneRoute(): JSX.Element {
  const params = Route.useParams()
  return (
    <Show when={params().sessionId} keyed>
      {(sessionId) => <ChatPane sessionId={sessionId} />}
    </Show>
  )
}
