import {widgetErrors} from '@conciv/errors'
export function createStyleSheet(text: string, doc: Document = document): CSSStyleSheet {
  const view = doc.defaultView

  if (!view) throw widgetErrors.NO_WINDOW()
  const sheet = new view.CSSStyleSheet()

  sheet.replaceSync(text)

  return sheet
}
