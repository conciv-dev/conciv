import {useSyncExternalStore} from 'react'
import {Button} from '@/components/ui/button'

declare global {
  interface WindowEventMap {
    'conciv:connection-changed': CustomEvent<{connected: boolean}>
  }
}

let connected = false

function subscribe(onChange: () => void): () => void {
  const handler = (event: WindowEventMap['conciv:connection-changed']) => {
    connected = event.detail.connected
    onChange()
  }
  window.addEventListener('conciv:connection-changed', handler)
  return () => window.removeEventListener('conciv:connection-changed', handler)
}

function useConcivConnected(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => connected,
    () => false,
  )
}

export function TryLiveButton() {
  const isConnected = useConcivConnected()
  const open = () => window.dispatchEvent(new Event('conciv:open-panel'))
  return (
    <div className="mt-6">
      <Button variant="outline" onClick={open}>
        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
        {isConnected ? 'Open agent panel' : 'Try it live — connect your agent'}
      </Button>
    </div>
  )
}
