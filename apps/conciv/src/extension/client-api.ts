import type {RequestMeta} from '@conciv/protocol/chat-types'
import type {ClientApi} from '@conciv/extension'
import {EFFECTS_SURFACE_ATTR, ensureEffectsSurface, openSource} from '@conciv/extension/client'
import {describe, locate, showToast, type Refs} from '@conciv/page'
import {Dialog, Popover} from '@conciv/ui-kit-system'
import type {LayerStack} from '../shell/dialogs.js'
import {registerWind4Properties} from '../lib/shadow.js'
import styles from '../styles.css?inline'

function elementAt(x: number, y: number): Element | null {
  const host = document.querySelector<HTMLElement>(`[${EFFECTS_SURFACE_ATTR}]`)
  const prev = host?.style.pointerEvents
  if (host) host.style.pointerEvents = 'none'
  const el = document.elementFromPoint(x, y)
  if (host) host.style.pointerEvents = prev ?? ''
  return el
}

export function makeAppClientApi(deps: {
  apiBase: string
  layers: LayerStack
  activeSession: () => string | null
}): ClientApi {
  registerWind4Properties()
  const refs: Refs = {map: new Map(), n: 0}
  return {
    apiBase: deps.apiBase,
    activeSession: deps.activeSession,
    requestMeta: (): RequestMeta => ({}),
    page: {elementAt, describe, locate: (el) => locate(el, refs)},
    openSource: (loc) => openSource(deps.apiBase, loc),
    toast: showToast,
    surface: () => ensureEffectsSurface({styles}),
    suppressWhile: (active) => deps.layers.register(active),
    yieldFocusWhile: (active) => deps.layers.register(active, false),
    Dialog: () => deps.layers.track(Dialog),
    Popover: () => Object.assign({}, Popover, {Root: deps.layers.track(Popover.Root)}),
    env: {reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches, doc: document, win: window},
  }
}
