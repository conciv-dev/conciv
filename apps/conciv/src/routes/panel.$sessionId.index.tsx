import {createFileRoute} from '@tanstack/solid-router'
import {Show, type JSX} from 'solid-js'
import {useConnection} from '../app/context.js'
import {ChatPane} from '../pane/chat-pane.js'
import {CHAT_VIEW_ID} from '../pane/view-tab-ids.js'

export const Route = createFileRoute('/panel/$sessionId/')({component: ChatPaneRoute})

function ChatPaneRoute(): JSX.Element {
  const params = Route.useParams()
  const connection = useConnection()
  const keyed = () => ({sessionId: params().sessionId, connection: connection()})
  return (
    <Show when={keyed()} keyed>
      {(value) => <ChatPane sessionId={value.sessionId} viewTab={CHAT_VIEW_ID} />}
    </Show>
  )
}
