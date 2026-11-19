import {createElement, type JSX} from 'preact'
import {useEffect, useState} from 'preact/hooks'
import {createConciv, type ConcivInit} from '@conciv/embed'

export type {ConcivInit, ConcivSettingsInit} from '@conciv/embed'

export type ConcivWidgetProps = ConcivInit

export function ConcivWidget(props: ConcivWidgetProps): JSX.Element {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const configKey = JSON.stringify({apiBase: props.apiBase, settings: props.settings})
  const [config, setConfig] = useState({key: configKey, apiBase: props.apiBase, settings: props.settings})
  if (config.key !== configKey) setConfig({key: configKey, apiBase: props.apiBase, settings: props.settings})
  useEffect(() => {
    if (!host) return
    const handle = createConciv({apiBase: config.apiBase, settings: config.settings})
    handle.mount(host).catch((error: unknown) => console.error('conciv widget failed to mount', error))
    return () => {
      handle.unmount()
    }
  }, [host, config])
  return createElement('div', {ref: setHost})
}
