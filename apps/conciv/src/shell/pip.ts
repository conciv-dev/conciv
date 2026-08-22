import {createEffect} from 'solid-js'
import {delegateEvents} from 'solid-js/web'
import {terminalTheme} from '@conciv/ui-kit-chat/theme/themes/terminal'
import styles from '../styles.css?inline'
import {registerWind4Properties} from '../lib/shadow.js'
import {applyChatTheme} from '../lib/theme.js'
import {applySchemeClass, type ColorScheme} from '../lib/color-scheme.js'

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

export type PipWindow = {win: Window; wrap: HTMLElement; root: ShadowRoot; close: () => void}

export function openPipWindow(
  opts: {title?: string; width?: number; height?: number; scheme?: () => ColorScheme} = {},
): PipWindow | null {
  const win = window.open('', 'conciv-pip', `width=${opts.width ?? 480},height=${opts.height ?? 620},popup`)
  if (!win) return null
  win.document.head.innerHTML = ''
  win.document.body.innerHTML = ''
  win.document.title = opts.title ?? 'conciv'
  win.document.body.style.margin = '0'

  registerWind4Properties(win.document)

  const host = win.document.createElement('div')
  host.setAttribute('data-conciv-pip-host', '')
  win.document.body.appendChild(host)
  const root = host.attachShadow({mode: 'open'})
  const style = win.document.createElement('style')
  style.textContent = styles
  root.appendChild(style)
  const wrap = win.document.createElement('div')
  applyChatTheme(terminalTheme, win.document)
  root.appendChild(wrap)
  createEffect(() => {
    const scheme = opts.scheme?.() ?? 'dark'
    wrap.className = `${PIP_WRAP} ${scheme}`
    applySchemeClass(host, scheme)
    win.document.documentElement.style.colorScheme = scheme
  })

  delegateEvents(DELEGATED, win.document)
  return {win, wrap, root, close: () => win.close()}
}
