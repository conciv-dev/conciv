import {useEffect} from 'react'
import {mountLiveWidget} from '@/lib/mount-live-widget'

export function LiveWidgetMount() {
  useEffect(() => {
    void mountLiveWidget().catch((error: unknown) => console.error('conciv live widget mount failed', error))
  }, [])
  return null
}
