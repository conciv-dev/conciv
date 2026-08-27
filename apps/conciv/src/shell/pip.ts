import {createEffect} from 'solid-js'
import {delegateEvents} from 'solid-js/web'
import {CHAT_FONTS} from '@conciv/ui-kit-chat/theme/fonts'
import styles from '../styles.css?inline'
import {registerFonts, registerWind4Properties} from '../lib/shadow.js'
import {applySchemeClass, applySkinClass, themeClasses, type HostTheme} from '../lib/color-scheme.js'

const DELEGATED = [
  'focusin',
  'focusout',
  'pointermove',
  'keydown',
  'pointerdown',
  'pointerup',
  'click',
  'mousedown',
  'input',
]

const PIP_WRAP =
  'fixed inset-0 flex [&>*]:!static [&>*]:!inset-auto [&>*]:!w-full [&>*]:!h-full [&>*]:!max-h-none [&>*]:!transform-none [&>*]:!opacity-100 [&>*]:!visible [&>*]:!pointer-events-auto [&>*]:!border-none [&>*]:!rounded-none [&>*]:!shadow-none [&_[role=separator]]:hidden'

const FALLBACK_THEME: HostTheme = {scheme: 'dark', skin: 'conciv'}

export type PipWindow = {win: Window; wrap: HTMLElement; root: ShadowRoot; close: () => void}

export function openPipWindow(
  opts: {title?: string; width?: number; height?: number; theme?: () => HostTheme} = {},
): PipWindow | null {
  const win = window.open('', 'conciv-pip', `width=${opts.width ?? 480},height=${opts.height ?? 620},popup`)
  if (!win) return null
  win.document.head.innerHTML = ''
  win.document.body.innerHTML = ''
  win.document.title = opts.title ?? 'conciv'
  win.document.body.style.margin = '0'

  registerWind4Properties(win.document)
  registerFonts(CHAT_FONTS, win.document)

  const host = win.document.createElement('div')
  host.setAttribute('data-conciv-pip-host', '')
  win.document.body.appendChild(host)
  const root = host.attachShadow({mode: 'open'})
  const style = win.document.createElement('style')
  style.textContent = styles
  root.appendChild(style)
  const wrap = win.document.createElement('div')
  root.appendChild(wrap)
  createEffect(() => {
    const theme = opts.theme?.() ?? FALLBACK_THEME
    wrap.className = `${PIP_WRAP} ${themeClasses(theme)}`
    applySchemeClass(host, theme.scheme)
    applySkinClass(host, theme.skin)
    applySchemeClass(win.document.documentElement, theme.scheme)
    applySkinClass(win.document.documentElement, theme.skin)
    win.document.documentElement.style.colorScheme = theme.scheme
  })

  delegateEvents(DELEGATED, win.document)
  return {win, wrap, root, close: () => win.close()}
}
