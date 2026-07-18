import {createElement, useEffect, useRef, type ReactElement} from 'react'
import {createConciv, type ConcivInit} from '@conciv/embed'

export type {ConcivInit, ConcivSettingsInit, ExtensionsInput} from '@conciv/embed'

export type ConcivWidgetProps = ConcivInit

export function ConcivWidget(props: ConcivWidgetProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })
  const configKey = JSON.stringify({apiBase: props.apiBase, settings: props.settings})
  const extensions = props.extensions
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const handle = createConciv({apiBase: latest.current.apiBase, settings: latest.current.settings, extensions})
    void handle.mount(el).catch(() => undefined)
    return () => {
      handle.unmount()
    }
  }, [configKey, extensions])
  return createElement('div', {ref: hostRef})
}
