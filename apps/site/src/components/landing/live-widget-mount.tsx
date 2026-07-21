import {useEffect} from 'react'
import {ClientOnly} from '@tanstack/react-router'
import {useIsMobile} from '@/lib/use-is-mobile'

export function LiveWidgetMount() {
  return (
    <ClientOnly>
      <LiveWidget />
    </ClientOnly>
  )
}

function LiveWidget() {
  const isMobile = useIsMobile()
  useEffect(() => {
    if (isMobile) return
    void import('@/lib/mount-live-widget')
      .then((module) => module.mountLiveWidget())
      .catch((error: unknown) => console.error('conciv live widget mount failed', error))
  }, [isMobile])
  return null
}
