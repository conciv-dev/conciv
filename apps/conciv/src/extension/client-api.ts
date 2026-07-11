import type {RequestMeta} from '@conciv/protocol/chat-types'
import type {ClientApi} from '@conciv/extension'
import {openSource} from '@conciv/extension/client'
import {describe, locate, showToast, type Refs} from '@conciv/page'
import {Dialog, Popover} from '@conciv/ui-kit-system'
import type {LayerStack} from '../shell/dialogs.js'
import {registerWind4Properties} from '../lib/shadow.js'

export function makeAppClientApi(deps: {
  apiBase: string
  layers: LayerStack
  activeSession: () => string | null
  surface: () => HTMLElement
  elementAt: (x: number, y: number) => Element | null
}): ClientApi {
  registerWind4Properties()
  const refs: Refs = {map: new Map(), n: 0}
  return {
    apiBase: deps.apiBase,
    activeSession: deps.activeSession,
    requestMeta: (): RequestMeta => ({}),
    page: {elementAt: deps.elementAt, describe, locate: (el) => locate(el, refs)},
    openSource: (loc) => openSource(deps.apiBase, loc),
    toast: showToast,
    surface: deps.surface,
    suppressWhile: (active) => deps.layers.register(active),
    yieldFocusWhile: (active) => deps.layers.register(active, false),
    Dialog: () => deps.layers.track(Dialog),
    Popover: () => Object.assign({}, Popover, {Root: deps.layers.track(Popover.Root)}),
    env: {reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches, doc: document, win: window},
  }
}
