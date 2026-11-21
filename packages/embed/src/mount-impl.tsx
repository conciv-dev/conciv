import {render} from 'solid-js/web'
import {makeEventListener} from '@solid-primitives/event-listener'
import {installReactBridge} from '@conciv/plugin-page/client'
import {ConcivApp, concivRoute, openBrowserDraftStore, type ConcivRoute, type Platform} from '@conciv/app'
import type {ConcivSettingsInit, ConcivSurface} from '@conciv/protocol/config-types'
import type {ConcivInit} from './mount.js'

type Engine = ReturnType<Platform['engine']>

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

const KEYBOARD_EVENTS = ['keydown', 'keypress', 'keyup'] as const

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const SELECTING_ATTRIBUTE = 'data-conciv-selecting'

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function queryCore(): string {
  const raw = new URLSearchParams(window.location.search).get('core')
  if (!raw) return ''
  try {
    const url = new URL(raw, window.location.origin)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (loopback || url.origin === window.location.origin) return raw
  } catch {}
  console.warn('[conciv] ignoring non-loopback cross-origin ?core= api base')
  return ''
}

function resolveApiBase(): string {
  return window.__CONCIV_API_BASE__ ?? (metaContent('conciv-api-base') || queryCore()) ?? ''
}

function isSettingsInit(value: unknown): value is ConcivSettingsInit {
  return typeof value === 'object' && value !== null
}

function metaSettings(): ConcivSettingsInit {
  try {
    const parsed: unknown = JSON.parse(metaContent('conciv-widget') || '{}')
    return isSettingsInit(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function connectRoute(settings: ConcivSettingsInit): ConcivRoute {
  return settings.defaultOpen === true
    ? concivRoute({to: '/panel/connect', search: {open: true}})
    : concivRoute({to: '/panel/connect'})
}

function isEditableInsideWidget(root: ShadowRoot, target: EventTarget | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (!root.contains(target)) return false
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable
}

function keepEditableKeysOffTheHostPage(root: ShadowRoot): Array<() => void> {
  const guard = (event: KeyboardEvent) => {
    if (!isEditableInsideWidget(root, event.composedPath()[0])) return
    event.stopPropagation()
  }
  return KEYBOARD_EVENTS.map((type) => makeEventListener(document, type, guard))
}

function registerSelectionContainment(): void {
  if (document.querySelector('style[data-conciv-selection]')) return
  const style = document.createElement('style')
  style.setAttribute('data-conciv-selection', '')
  style.textContent = `html[${SELECTING_ATTRIBUTE}],html[${SELECTING_ATTRIBUTE}] *{user-select:none !important}`
  document.head.appendChild(style)
}

function keepSelectionInsideTheWidget(host: HTMLElement, root: ShadowRoot): Array<() => void> {
  const release = () => {
    document.documentElement.removeAttribute(SELECTING_ATTRIBUTE)
    host.style.removeProperty('user-select')
  }
  return [
    makeEventListener(root, 'pointerdown', () => {
      host.style.setProperty('user-select', 'text', 'important')
      document.documentElement.setAttribute(SELECTING_ATTRIBUTE, '')
    }),
    makeEventListener(document, 'pointerup', release),
    makeEventListener(document, 'pointercancel', release),
    makeEventListener(document, 'dragstart', release),
    makeEventListener(window, 'blur', release),
    release,
  ]
}

function placeHost(host: HTMLElement, surface: ConcivSurface): void {
  host.style.pointerEvents = 'none'
  if (surface === 'dock') {
    host.style.position = 'relative'
    host.style.width = '100%'
    host.style.height = '100%'
    host.style.contain = 'layout'
    return
  }
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.zIndex = '2147483000'
}

function createShadowRoot(host: HTMLElement, surface: ConcivSurface): {root: ShadowRoot; dispose: () => void} {
  registerSelectionContainment()
  placeHost(host, surface)
  const root = host.attachShadow({mode: 'open'})
  const releases = [...keepEditableKeysOffTheHostPage(root), ...keepSelectionInsideTheWidget(host, root)]
  return {
    root,
    dispose: () => {
      for (const release of releases) release()
    },
  }
}

function initialEngine(init: ConcivInit): Engine {
  const apiBase = init.apiBase ?? resolveApiBase()
  if (!apiBase && (init.plugins ?? []).length > 0) return {kind: 'servers'}
  return {kind: 'bound', apiBase, token: init.engineToken}
}

export function mountImpl(
  init: ConcivInit,
  el: HTMLElement,
): {ready: Promise<void>; teardown: () => void; rebind: (apiBase: string) => Promise<void>} {
  installReactBridge()
  const hostRouter = window.__TSR_ROUTER__
  const settings = init.settings ?? metaSettings()
  const host = document.createElement('div')
  host.setAttribute('data-conciv-root', '')
  el.appendChild(host)
  const shadow = createShadowRoot(host, settings.surface === 'dock' ? 'dock' : 'page')
  const first = initialEngine(init)
  const servers = first.kind === 'servers'
  const interactive = Promise.withResolvers<void>()
  const platform: Platform = {
    engine: () => first,
    navigation: servers ? {memory: connectRoute(settings)} : 'engine',
    root: shadow.root,
    settings,
    plugins: init.plugins,
    grabProvider: init.grabProvider,
    onInteractive: interactive.resolve,
    timings: init.timings,
    draftStore: openBrowserDraftStore,
  }
  const container = document.createElement('div')
  shadow.root.appendChild(container)
  const disposeApp = render(() => <ConcivApp platform={platform} />, container)
  window.__TSR_ROUTER__ = hostRouter
  const state = {disposed: false}
  const rebind = async (apiBase: string): Promise<void> => {
    await interactive.promise
    if (state.disposed || servers) return
    window.dispatchEvent(new CustomEvent('conciv:rebind', {detail: {apiBase}}))
  }
  const teardown = (): void => {
    state.disposed = true
    shadow.dispose()
    try {
      disposeApp()
    } finally {
      host.remove()
      window.__TSR_ROUTER__ = hostRouter
      interactive.resolve()
    }
  }
  return {ready: interactive.promise, teardown, rebind}
}
