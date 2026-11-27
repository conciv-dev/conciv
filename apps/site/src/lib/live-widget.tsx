import {useCallback} from 'react'
import {useRouter} from '@tanstack/react-router'
import {mountDocsDemo} from '@/lib/mount-docs-demo'
import {mountLiveWidget} from '@/lib/mount-live-widget'
import {PLAYGROUND_HOST_CLASS} from '@/playground/shell-api'

export default function LiveWidget({docs}: {docs: boolean}) {
  const router = useRouter()
  const mount = useCallback(
    (host: HTMLDivElement | null) => {
      if (host === null) return
      if (docs) return mountDocsDemo(host)
      return mountLiveWidget({host, router})
    },
    [docs, router],
  )
  return <div ref={mount} className={docs ? PLAYGROUND_HOST_CLASS : undefined} />
}
