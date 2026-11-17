import {once} from 'es-toolkit'
import base from '../styles.css?inline'
import utilities from 'virtual:uno.css?inline'

export const widgetStyles = `${base}${utilities}`

export function createStyleSheet(text: string, doc: Document = document): CSSStyleSheet {
  const view = doc.defaultView

  if (!view) throw new Error('The document has no window to build a stylesheet in')
  const sheet = new view.CSSStyleSheet()

  sheet.replaceSync(text)

  return sheet
}

export const widgetSheet = once((): CSSStyleSheet => createStyleSheet(widgetStyles))
