import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'

export function widgetBundleFile(embedEntry?: string): string {
  const entry = embedEntry ?? createRequire(import.meta.url).resolve('@conciv/embed')
  return join(dirname(entry), 'conciv-widget.global.js')
}
