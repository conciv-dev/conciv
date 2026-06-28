import type {WidgetConfig} from '@mandarax/protocol/config-types'

export type HtmlTag = {tag: string; attrs: Record<string, string | boolean>; injectTo: 'head'}

// The route the plugin's dev server serves the compiled extensions entry at (kept in sync with the
// plugin's EXTENSIONS_ROUTE; core can't import the plugin, so the convention is duplicated here).
const EXTENSIONS_ROUTE = '/@mandarax/extensions.js'

// <head> tags the bundler plugin injects: pw-api-base (cross-origin core server), the widget layout
// config (pw-widget, JSON so nesting + hotkey arrays survive), + the widget script.
export function htmlTags(corePort: number, opts: {widget?: WidgetConfig}): HtmlTag[] {
  return [
    {tag: 'meta', attrs: {name: 'pw-api-base', content: `http://127.0.0.1:${corePort}`}, injectTo: 'head'},
    {tag: 'meta', attrs: {name: 'pw-widget', content: JSON.stringify(opts.widget ?? {})}, injectTo: 'head'},
    {tag: 'script', attrs: {type: 'module', src: EXTENSIONS_ROUTE}, injectTo: 'head'},
  ]
}
