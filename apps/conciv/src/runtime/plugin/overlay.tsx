import {createRoot, type Accessor} from 'solid-js'
import {themeClasses, type HostTheme} from '../../lib/color-scheme'
import {createStyleSheet, widgetSheet} from '../../lib/widget-styles'

const OVERLAY_Z_INDEX = '2147482999'

function placeHost(host: HTMLElement): void {
  host.setAttribute('data-conciv-overlay', '')
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.zIndex = OVERLAY_Z_INDEX
}

export function mountOverlay(
  theme: Accessor<HostTheme>,
  styles: readonly string[] | undefined,
): {readonly element: HTMLElement; dispose(): void} {
  const host = document.createElement('div')
  placeHost(host)
  const root = host.attachShadow({mode: 'open'})
  const shared = widgetSheet(document)
  root.adoptedStyleSheets = styles === undefined ? [shared] : [shared, createStyleSheet(styles.join('\n'))]

  return createRoot((disposeRoot) => {
    const element = <div class={themeClasses(theme())} />

    if (!(element instanceof HTMLElement)) throw new Error('The overlay element did not render')
    root.append(element)
    document.body.append(host)

    return {
      element,
      dispose() {
        disposeRoot()
        host.remove()
      },
    }
  })
}
