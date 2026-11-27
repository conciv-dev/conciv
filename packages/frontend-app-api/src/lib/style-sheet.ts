import {libErrors} from './errors'
export function createStyleSheet(text: string, doc: Document = document): CSSStyleSheet {
  const view = doc.defaultView

  if (!view) throw libErrors.NO_WINDOW()
  const sheet = new view.CSSStyleSheet()

  sheet.replaceSync(text)

  return sheet
}
