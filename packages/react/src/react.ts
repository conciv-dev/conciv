import {log} from 'evlog'
import {createElement, Fragment, useEffect, useRef, useState, type ReactElement, type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {createConciv, type ConcivInit} from '@conciv/app'
import {listenForPortals} from '@conciv/frontend-plugin-api'
import {PORTAL_EVENT} from './portals.js'

export type {ConcivInit, ConcivSettingsInit} from '@conciv/app'

export {reactRender} from './portals.js'

export type ConcivWidgetProps = ConcivInit

type Portal = {
  readonly key: number
  readonly element: HTMLElement
  readonly node: ReactNode
}

const REFERENCE_FIELDS: ReadonlyArray<'plugins' | 'grabProvider' | 'engineToken'> = [
  'plugins',
  'grabProvider',
  'engineToken',
]

export function ConcivWidget(props: ConcivWidgetProps): ReactElement {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [portals, setPortals] = useState<readonly Portal[]>([])
  const nextKey = useRef(0)
  const configKey = JSON.stringify({apiBase: props.apiBase, settings: props.settings, logLevel: props.logLevel})
  const init: ConcivInit = {
    apiBase: props.apiBase,
    settings: props.settings,
    plugins: props.plugins,
    grabProvider: props.grabProvider,
    engineToken: props.engineToken,
    logLevel: props.logLevel,
  }
  const [config, setConfig] = useState({key: configKey, init})
  if (config.key !== configKey || REFERENCE_FIELDS.some((field) => config.init[field] !== props[field]))
    setConfig({key: configKey, init})
  useEffect(() => {
    if (!host) return
    const stopListening = listenForPortals<ReactNode>(host, PORTAL_EVENT, (element, node) => {
      nextKey.current += 1
      const portal: Portal = {key: nextKey.current, element, node}
      setPortals((current) => [...current, portal])
      return () => setPortals((current) => current.filter((entry) => entry !== portal))
    })
    const handle = createConciv(config.init)
    handle
      .mount(host)
      .catch((error: unknown) => log.error({action: 'widget', message: 'the widget failed to mount', error}))
    return () => {
      handle.unmount()
      stopListening()
    }
  }, [host, config])
  return createElement(
    Fragment,
    null,
    createElement('div', {ref: setHost}),
    portals.map((portal) => createPortal(portal.node, portal.element, String(portal.key))),
  )
}
