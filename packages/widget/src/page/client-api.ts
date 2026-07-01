import type {RequestMeta} from '@conciv/api-client'
import type {ClientApi} from '@conciv/extension'
import {EFFECTS_SURFACE_ATTR, ensureEffectsSurface, openSource} from '@conciv/extension/client'
import {describe, locate} from './react-bridge.js'
import {showToast} from './effect-toast.js'
import type {Refs} from './page-snapshot.js'
import {registerWind4Properties} from '../shadow.js'
import {Dialog, Popover} from '@conciv/ui-kit-system'
import {registerSuppressor, track} from '../shell/dialogs.js'
import styles from '../styles.css?inline'

// elementFromPoint, but blind to the overlay host itself so a hit-test lands on the user's app element.
function elementAt(x: number, y: number): Element | null {
  const host = document.querySelector<HTMLElement>(`[${EFFECTS_SURFACE_ATTR}]`)
  const prev = host?.style.pointerEvents
  if (host) host.style.pointerEvents = 'none'
  const el = document.elementFromPoint(x, y)
  if (host) host.style.pointerEvents = prev ?? ''
  return el
}

// The concrete ClientApi the widget hands to every extension's .client() at mount: the active chat
// session id plus the page capabilities a page-control extension drives. Built once, server-independent.
export function makeWidgetClientApi(deps: {
  apiBase: string
  refs: Refs
  activeSession: () => string | null
}): ClientApi {
  registerWind4Properties()
  return {
    apiBase: deps.apiBase,
    activeSession: deps.activeSession,
    requestMeta: (): RequestMeta => ({}),
    page: {elementAt, describe, locate: (el) => locate(el, deps.refs)},
    openSource: (loc) => openSource(deps.apiBase, loc),
    toast: showToast,
    surface: () => ensureEffectsSurface({styles}),
    suppressWhile: (active) => registerSuppressor(active),
    Dialog: () => track(Dialog),
    Popover: () => Object.assign({}, Popover, {Root: track(Popover.Root)}),
    env: {reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches, doc: document, win: window},
  }
}
