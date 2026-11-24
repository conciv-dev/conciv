import {useSyncExternalStore} from 'react'
import {Link} from '@tanstack/react-router'
import {Button} from '../ui/button'
import {
  CONNECTION_CHANGED_EVENT,
  type EventBusClientState,
  type WidgetConnectionChangedDetail,
} from '@conciv/protocol/event-bus'
import {panelCommands} from '../../lib/panel-commands'
import {tryButtonLabel} from '../../lib/try-state'

declare global {
  interface WindowEventMap {
    [CONNECTION_CHANGED_EVENT]: CustomEvent<WidgetConnectionChangedDetail>
  }
}

let connected = false

function subscribeConnection(onChange: () => void): () => void {
  const handler = (event: WindowEventMap[typeof CONNECTION_CHANGED_EVENT]) => {
    connected = event.detail.connected
    onChange()
  }
  window.addEventListener(CONNECTION_CHANGED_EVENT, handler)
  return () => window.removeEventListener(CONNECTION_CHANGED_EVENT, handler)
}

function useConcivConnected(): boolean {
  return useSyncExternalStore(
    subscribeConnection,
    () => connected,
    () => false,
  )
}

function useBusState(): EventBusClientState {
  return useSyncExternalStore(panelCommands.subscribe, panelCommands.getState, () => 'idle')
}

export function TryLiveButton() {
  const isConnected = useConcivConnected()
  const busState = useBusState()
  return (
    <div className="mt-6">
      <Button variant="default" asChild aria-busy={busState === 'connecting'}>
        <Link to="/" search={(previous) => ({...previous, try: 1})} resetScroll={false}>
          <span className="size-1.5 rounded-full bg-primary-foreground" aria-hidden />
          {tryButtonLabel({connected: isConnected, pending: busState === 'connecting'})}
        </Link>
      </Button>
    </div>
  )
}
