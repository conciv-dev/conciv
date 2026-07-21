import {useEffect} from 'react'
import {useIsMobile} from '@/lib/use-is-mobile'
import {mountLiveWidget} from '@/lib/mount-live-widget'

export function LiveWidgetMount() {
  const isMobile = useIsMobile()
  useEffect(() => {
    if (isMobile) return
    void mountLiveWidget().catch((error: unknown) => console.error('conciv live widget mount failed', error))
  }, [isMobile])
  return null
}
