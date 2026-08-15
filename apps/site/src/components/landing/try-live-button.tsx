import {useSyncExternalStore} from 'react'
import {Button} from '@/components/ui/button'
import {
  CONNECTION_CHANGED_EVENT,
  createEventBusClient,
  OPEN_PANEL_EVENT,
  PANEL_COMMAND_CHANNEL,
  type EventBusClientState,
  type PanelCommandEventMap,
  type WidgetConnectionChangedDetail,
} from '@conciv/protocol/event-bus'
import {tryButtonLabel} from '@/lib/try-state'

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

const panelCommands = createEventBusClient<PanelCommandEventMap>({
  channel: PANEL_COMMAND_CHANNEL,
  reconnectEveryMs: 500,
  maxRetries: 60,
})

function useBusState(): EventBusClientState {
  return useSyncExternalStore(panelCommands.subscribe, panelCommands.getState, () => 'idle')
}

export function TryLiveButton() {
  const isConnected = useConcivConnected()
  const busState = useBusState()
  const open = () => panelCommands.emit(OPEN_PANEL_EVENT, undefined)
  return (
    <div className="mt-6">
      <Button variant="default" onClick={open} aria-busy={busState === 'connecting'}>
        <span className="size-1.5 rounded-full bg-primary-foreground" aria-hidden />
        {tryButtonLabel({connected: isConnected, pending: busState === 'connecting'})}
      </Button>
    </div>
  )
}
