import {createFileRoute} from '@tanstack/solid-router'
import {Show, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import {createShownDocks} from '../extensions/devframe-docks.js'

const STATE = 'flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-chat-text'
const STATE_TEXT = 'm-0 text-[0.875rem] leading-[1.45] text-chat-text-2 max-w-72'

export const Route = createFileRoute('/panel/$sessionId/dock/$dockId')({component: PanelDock})

function PanelDock(): JSX.Element {
  const params = Route.useParams()
  const navigate = Route.useNavigate()
  const {shell, docks} = createShownDocks()
  const shown = () => docks().some((entry) => entry.id === params().dockId)
  const backToChat = () =>
    void navigate({to: '/panel/$sessionId', params: {sessionId: params().sessionId}, replace: true})
  return (
    <Show when={!shown()}>
      <div class={STATE} role="status">
        <p class={STATE_TEXT}>
          {shell.link() ? 'This panel is not available on this page.' : 'Connecting to the hub.'}
        </p>
        <Button variant="outline" onClick={backToChat}>
          Back to chat
        </Button>
      </div>
    </Show>
  )
}
