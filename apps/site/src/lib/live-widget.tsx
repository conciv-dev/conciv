import {useCallback, useState} from 'react'
import {useRouter} from '@tanstack/react-router'
import {mountDocsDemo} from '@/lib/mount-docs-demo'
import {mountLiveWidget} from '@/lib/mount-live-widget'

export default function LiveWidget({open, docs}: {open: boolean; docs: boolean}) {
  const router = useRouter()
  const [widgetOpen] = useState(open)
  const mount = useCallback(
    (host: HTMLDivElement | null) => {
      if (host === null) return
      if (docs) return mountDocsDemo(host)
      return mountLiveWidget({host, widgetOpen, router})
    },
    [docs, widgetOpen, router],
  )
  return <div ref={mount} />
}
