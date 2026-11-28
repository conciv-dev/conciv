import {useCallback, useSyncExternalStore} from 'react'
import {type QueryClient, useQueryClient} from '@tanstack/react-query'
import {Link, useSearch} from '@tanstack/react-router'
import {Button} from '@/components/ui/button'
import {
  CONNECTION_CHANGED_EVENT,
  type EventBusClientState,
  type WidgetConnectionChangedDetail,
} from '@conciv/types/event-bus'
import {panelCommands} from '@/lib/panel-commands'
import {tryButtonLabel} from '@/lib/try-state'

declare global {
  interface WindowEventMap {
    [CONNECTION_CHANGED_EVENT]: CustomEvent<WidgetConnectionChangedDetail>
  }
}

const CONNECTED_KEY = ['conciv-connected']

function subscribeConnection(queryClient: QueryClient, onChange: () => void): () => void {
  queryClient.setQueryDefaults(CONNECTED_KEY, {gcTime: Infinity})
  const handler = (event: WindowEventMap[typeof CONNECTION_CHANGED_EVENT]) => {
    queryClient.setQueryData(CONNECTED_KEY, event.detail.connected)
    onChange()
  }
  window.addEventListener(CONNECTION_CHANGED_EVENT, handler)
  return () => window.removeEventListener(CONNECTION_CHANGED_EVENT, handler)
}

function useConcivConnected(): boolean {
  const queryClient = useQueryClient()
  const subscribe = useCallback((onChange: () => void) => subscribeConnection(queryClient, onChange), [queryClient])
  return useSyncExternalStore(
    subscribe,
    () => queryClient.getQueryData<boolean>(CONNECTED_KEY) ?? false,
    () => false,
  )
}

function useBusState(): EventBusClientState {
  return useSyncExternalStore(panelCommands.subscribe, panelCommands.getState, () => 'idle')
}

export function TryLiveButton() {
  const isConnected = useConcivConnected()
  const busState = useBusState()
  const tryRequested = useSearch({strict: false, select: (search) => search.try === 1})
  return (
    <div className="mt-6">
      <Button variant="default" asChild aria-busy={busState === 'connecting'}>
        <Link
          to="/"
          search={(previous) => ({...previous, try: 1})}
          resetScroll={false}
          onClick={() => {
            if (tryRequested) panelCommands.emit('open', undefined)
          }}
        >
          <span className="size-1.5 rounded-full bg-primary-foreground" aria-hidden />
          {tryButtonLabel({connected: isConnected, pending: busState === 'connecting'})}
        </Link>
      </Button>
    </div>
  )
}
