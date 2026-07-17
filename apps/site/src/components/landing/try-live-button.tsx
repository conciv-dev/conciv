import {useEffect, useState} from 'react'
import {Button} from '@/components/ui/button'

export function TryLiveButton() {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{connected: boolean}>).detail
      setConnected(Boolean(detail?.connected))
    }
    window.addEventListener('conciv:connection-changed', onChange)
    return () => window.removeEventListener('conciv:connection-changed', onChange)
  }, [])

  const open = () => window.dispatchEvent(new Event('conciv:open-panel'))
  return (
    <div className="mt-6">
      <Button variant="outline" onClick={open}>
        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
        {connected ? 'Open agent panel' : 'Try it live — connect your agent'}
      </Button>
    </div>
  )
}
