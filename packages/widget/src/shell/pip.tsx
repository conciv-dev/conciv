import {createSignal, onCleanup} from 'solid-js'
import {delegateEvents} from 'solid-js/web'
import styles from '../styles.css?inline'
import {registerWind4Properties} from '../shadow.js'

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

export function createPiP(): {
  active: () => boolean
  open: (node: HTMLElement, opts?: {title?: string; width?: number; height?: number}) => void
  close: () => void
} {
  const [win, setWin] = createSignal<Window | null>(null)
  let placeholder: Comment | null = null
  let moved: HTMLElement | null = null

  const redock = () => {
    if (moved && placeholder?.parentNode) placeholder.parentNode.replaceChild(moved, placeholder)
    moved = null
    placeholder = null
  }

  const close = () => {
    const w = win()
    redock()
    if (w) w.close()
    setWin(null)
  }

  const open = (node: HTMLElement, opts: {title?: string; width?: number; height?: number} = {}) => {
    if (win()) return
    const w = window.open('', 'conciv-pip', `width=${opts.width ?? 480},height=${opts.height ?? 620},popup`)
    if (!w) return
    w.document.head.innerHTML = ''
    w.document.body.innerHTML = ''
    w.document.title = opts.title ?? 'conciv'
    w.document.body.style.margin = '0'

    registerWind4Properties(w.document)

    const host = w.document.createElement('div')
    host.setAttribute('data-pw-pip-host', '')
    w.document.body.appendChild(host)
    const root = host.attachShadow({mode: 'open'})
    const sourceRoot = node.getRootNode()
    const sourceStyles = sourceRoot instanceof ShadowRoot ? [...sourceRoot.querySelectorAll('style')] : []
    if (sourceStyles.length > 0) {
      for (const sourceStyle of sourceStyles) root.appendChild(sourceStyle.cloneNode(true))
    } else {
      const style = w.document.createElement('style')
      style.textContent = styles
      root.appendChild(style)
    }
    const themeClasses: string[] = []
    for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
      themeClasses.push(...[...ancestor.classList].filter((name) => name.startsWith('chat-theme-')))
    }
    const wrap = w.document.createElement('div')
    wrap.className = [PIP_WRAP, ...themeClasses].join(' ')
    root.appendChild(wrap)

    placeholder = node.ownerDocument.createComment('conciv-pip')
    node.parentNode?.replaceChild(placeholder, node)
    wrap.appendChild(node)
    moved = node

    delegateEvents(DELEGATED, w.document)
    w.addEventListener('pagehide', close)
    window.addEventListener('beforeunload', close)
    setWin(w)
  }

  onCleanup(() => {
    if (win()) close()
  })

  return {active: () => win() !== null, open, close}
}
