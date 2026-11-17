import {createRoot, type Accessor} from 'solid-js'
import {PLUGIN_OVERLAY_ATTR} from '@conciv/protocol/page-types'
import {themeClasses, type HostTheme} from '../../lib/color-scheme'
import {createStyleSheet, widgetSheet} from '../../lib/widget-styles'

const OVERLAY_Z_INDEX = '2147482999'

function placeHost(host: HTMLElement): void {
  host.setAttribute(PLUGIN_OVERLAY_ATTR, '')
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.zIndex = OVERLAY_Z_INDEX
}

export function mountOverlay(
  theme: Accessor<HostTheme>,
  styles: readonly string[] | undefined,
): {readonly element: HTMLElement; dispose(): void} {
  return createRoot((disposeRoot) => {
    const host = <div class={themeClasses(theme())} />
    const element = <div class={`font-chat text-chat-text ${themeClasses(theme())}`} />

    if (!(host instanceof HTMLElement)) throw new Error('The overlay host did not render')
    if (!(element instanceof HTMLElement)) throw new Error('The overlay element did not render')
    placeHost(host)
    const root = host.attachShadow({mode: 'open'})
    const shared = widgetSheet()
    root.adoptedStyleSheets = styles === undefined ? [shared] : [shared, createStyleSheet(styles.join('\n'))]
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
