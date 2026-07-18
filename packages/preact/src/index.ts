import {createElement, type JSX} from 'preact'
import {useEffect, useRef} from 'preact/hooks'
import {createConciv, type ConcivInit} from '@conciv/embed'

export type {ConcivInit, ConcivSettingsInit} from '@conciv/embed'

export type ConcivWidgetProps = ConcivInit

export function ConcivWidget(props: ConcivWidgetProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const configKey = JSON.stringify({apiBase: props.apiBase, settings: props.settings})
  const extensions = props.extensions
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const handle = createConciv({apiBase: props.apiBase, settings: props.settings, extensions})
    void handle.mount(el).catch(() => undefined)
    return () => {
      handle.unmount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apiBase/settings are value-keyed via configKey
  }, [configKey, extensions])
  return createElement('div', {ref: hostRef})
}
