import {useSyncExternalStore} from 'react'
import {Button} from '@/components/ui/button'
import {tryButtonLabel} from '@/lib/try-state'

declare global {
  interface WindowEventMap {
    'conciv:connection-changed': CustomEvent<{connected: boolean}>
  }
}

let connected = false
let mounted = false
let pendingOpen = false
const pendingListeners = new Set<() => void>()

function notifyPending(): void {
  for (const listener of pendingListeners) listener()
}

function subscribeConnection(onChange: () => void): () => void {
  const handler = (event: WindowEventMap['conciv:connection-changed']) => {
    connected = event.detail.connected
    onChange()
  }
  window.addEventListener('conciv:connection-changed', handler)
  return () => window.removeEventListener('conciv:connection-changed', handler)
}

function subscribeMounted(onChange: () => void): () => void {
  const handler = () => {
    mounted = true
    if (pendingOpen) {
      pendingOpen = false
      window.dispatchEvent(new Event('conciv:open-panel'))
      notifyPending()
    }
    onChange()
  }
  window.addEventListener('conciv:widget-mounted', handler)
  return () => window.removeEventListener('conciv:widget-mounted', handler)
}

function subscribePending(onChange: () => void): () => void {
  pendingListeners.add(onChange)
  return () => pendingListeners.delete(onChange)
}

function useConcivConnected(): boolean {
  return useSyncExternalStore(
    subscribeConnection,
    () => connected,
    () => false,
  )
}

function useWidgetMounted(): boolean {
  return useSyncExternalStore(
    subscribeMounted,
    () => mounted,
    () => false,
  )
}

function usePendingOpen(): boolean {
  return useSyncExternalStore(
    subscribePending,
    () => pendingOpen,
    () => false,
  )
}

export function TryLiveButton() {
  const isConnected = useConcivConnected()
  const isMounted = useWidgetMounted()
  const isPending = usePendingOpen()
  const open = () => {
    if (isMounted) {
      window.dispatchEvent(new Event('conciv:open-panel'))
      return
    }
    pendingOpen = true
    notifyPending()
  }
  return (
    <div className="mt-6">
      <Button variant="default" onClick={open} aria-busy={isPending}>
        <span className="size-1.5 rounded-full bg-primary-foreground" aria-hidden />
        {tryButtonLabel({connected: isConnected, pending: isPending})}
      </Button>
    </div>
  )
}
