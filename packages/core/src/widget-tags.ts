import type {WidgetConfig} from '@conciv/protocol/config-types'

export type HtmlTag = {tag: string; attrs: Record<string, string | boolean>; injectTo: 'head'}

const EXTENSIONS_ROUTE = '/@conciv/extensions.js'

export function htmlTags(corePort: number, opts: {widget?: WidgetConfig}): HtmlTag[] {
  return [
    {tag: 'meta', attrs: {name: 'pw-api-base', content: `http://127.0.0.1:${corePort}`}, injectTo: 'head'},
    {tag: 'meta', attrs: {name: 'pw-widget', content: JSON.stringify(opts.widget ?? {})}, injectTo: 'head'},
    {tag: 'script', attrs: {type: 'module', src: EXTENSIONS_ROUTE}, injectTo: 'head'},
  ]
}
