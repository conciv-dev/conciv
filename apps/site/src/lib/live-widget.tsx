import {useEffect} from 'react'
import {mountLiveWidget} from '@/lib/mount-live-widget'

export default function LiveWidget({open, tryParam}: {open: boolean; tryParam: boolean}) {
  useEffect(() => {
    mountLiveWidget({widgetOpen: open, tryParam}).catch((error: unknown) =>
      console.error('conciv live widget mount failed', error),
    )
  }, [open, tryParam])
  return null
}
