'use client'

import {ConcivWidget} from '@conciv/react'

const extensions = () => import('@conciv/extension-terminal/client').then((mod) => [mod.default])
const port = process.env.NEXT_PUBLIC_CONCIV_PORT

export function ConcivWidgetClient() {
  if (!port) return null
  return <ConcivWidget extensions={extensions} apiBase={`http://127.0.0.1:${port}`} />
}
