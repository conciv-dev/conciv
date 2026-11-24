import {useEffect} from 'react'
import {useRouter} from '@tanstack/react-router'
import {mountLiveWidget} from './mount-live-widget'

export default function LiveWidget({open}: {open: boolean}) {
  const router = useRouter()
  useEffect(() => {
    mountLiveWidget({widgetOpen: open, router}).catch((error: unknown) =>
      console.error('conciv live widget mount failed', error),
    )
  }, [open, router])
  return null
}
