import {useEffect} from 'react'
import {mountLiveWidget} from '@/lib/mount-live-widget'

export default function LiveWidget({open}: {open: boolean}) {
  useEffect(() => {
    mountLiveWidget({widgetOpen: open}).catch((error: unknown) =>
      console.error('conciv live widget mount failed', error),
    )
  }, [open])
  return null
}
