'use client'

import {ConcivWidget} from '@conciv/react'

const extensions = () => import('@conciv/extension-terminal/client').then((mod) => [mod.default])
const port = process.env.NEXT_PUBLIC_CONCIV_PORT

function presetApiBase(): string | undefined {
  const preset = Reflect.get(globalThis, '__CONCIV_API_BASE__')
  return typeof preset === 'string' ? preset : undefined
}

export function ConcivWidgetClient() {
  if (!port) return null
  return <ConcivWidget extensions={extensions} apiBase={presetApiBase() ?? `http://127.0.0.1:${port}`} />
}
