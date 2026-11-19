import {createElement, type JSX} from 'preact'
import {useEffect, useState} from 'preact/hooks'
import {createConciv, type ConcivInit} from '@conciv/embed'

export type {ConcivInit, ConcivSettingsInit} from '@conciv/embed'

export type ConcivWidgetProps = ConcivInit

const REFERENCE_FIELDS: ReadonlyArray<'plugins' | 'grabProvider' | 'engineToken'> = [
  'plugins',
  'grabProvider',
  'engineToken',
]

export function ConcivWidget(props: ConcivWidgetProps): JSX.Element {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const configKey = JSON.stringify({apiBase: props.apiBase, settings: props.settings})
  const init: ConcivInit = {
    apiBase: props.apiBase,
    settings: props.settings,
    plugins: props.plugins,
    grabProvider: props.grabProvider,
    engineToken: props.engineToken,
  }
  const [config, setConfig] = useState({key: configKey, init})
  if (config.key !== configKey || REFERENCE_FIELDS.some((field) => config.init[field] !== props[field]))
    setConfig({key: configKey, init})
  useEffect(() => {
    if (!host) return
    const handle = createConciv(config.init)
    handle.mount(host).catch((error: unknown) => console.error('conciv widget failed to mount', error))
    return () => {
      handle.unmount()
    }
  }, [host, config])
  return createElement('div', {ref: setHost})
}
