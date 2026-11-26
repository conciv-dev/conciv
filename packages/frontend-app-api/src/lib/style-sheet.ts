export function createStyleSheet(text: string, doc: Document = document): CSSStyleSheet {
  const view = doc.defaultView

  if (!view) throw new Error('The document has no window to build a stylesheet in')
  const sheet = new view.CSSStyleSheet()

  sheet.replaceSync(text)

  return sheet
}
