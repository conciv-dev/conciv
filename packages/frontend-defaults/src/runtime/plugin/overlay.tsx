import {createRoot, For, type Accessor} from 'solid-js'
import {PLUGIN_OVERLAY_ATTR} from '@conciv/types/ui-types'
import {themeClasses, type HostTheme} from '../../lib/color-scheme'
import {createStyleSheet} from '@internal/frontend-app-api/lib/style-sheet'
import {widgetSheet} from '../../lib/widget-styles'
import {WIDGET_LAYER} from '../../lib/widget-layer'
import {AdoptedStyle} from '@internal/frontend-app-api/plugin/render'
import {widgetPluginErrors} from '@conciv/errors'

function placeHost(host: HTMLElement): void {
  host.setAttribute(PLUGIN_OVERLAY_ATTR, '')
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.zIndex = String(WIDGET_LAYER - 1)
}

export function mountOverlay(
  theme: Accessor<HostTheme>,
  styles: readonly string[] | undefined,
  pluginStyles: Accessor<readonly string[]>,
): {readonly element: HTMLElement; dispose(): void} {
  return createRoot((disposeRoot) => {
    const host = <div class={themeClasses(theme())} />
    const element = <div class={`font-chat text-chat-text ${themeClasses(theme())}`} />

    if (!(host instanceof HTMLElement)) throw widgetPluginErrors.OVERLAY_NOT_RENDERED({part: 'host'})
    if (!(element instanceof HTMLElement)) throw widgetPluginErrors.OVERLAY_NOT_RENDERED({part: 'element'})
    placeHost(host)
    document.body.append(host)
    const root = host.attachShadow({mode: 'open'})
    const shared = widgetSheet()
    root.adoptedStyleSheets = styles === undefined ? [shared] : [shared, createStyleSheet(styles.join('\n'))]
    root.append(element)
    void (<For each={pluginStyles()}>{(css) => <AdoptedStyle root={root} css={css} />}</For>)

    return {
      element,
      dispose() {
        disposeRoot()
        host.remove()
      },
    }
  })
}
