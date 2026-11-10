export async function settled(input: {doc: Document; cap: number}): Promise<number | null> {
  const {doc, cap} = input
  const started = performance.now()
  const loaded = Promise.all(pendingSheets(doc).map(loadOf)).then(async () => {
    doc.documentElement.getBoundingClientRect()
    await doc.fonts.ready
    return doc.fonts.status === 'loaded'
  })
  const capped = new Promise<false>((resolve) => setTimeout(() => resolve(false), cap))
  const done = await Promise.race([loaded, capped])
  return done ? null : Math.round(performance.now() - started)
}

const SHEET_OWNERS = 'style, link[rel~="stylesheet"]'

function pendingSheets(doc: Document): Element[] {
  const view = doc.defaultView
  if (view === null) return []
  return [...doc.querySelectorAll(SHEET_OWNERS)].filter((element) => {
    if (!(element instanceof view.HTMLStyleElement) && !(element instanceof view.HTMLLinkElement)) return false
    const {sheet} = element
    return sheet === null || importing({sheet, view})
  })
}

function importing(input: {sheet: CSSStyleSheet; view: Window & typeof globalThis}): boolean {
  const {view} = input
  return readableRules(input.sheet).some(
    (rule) =>
      rule instanceof view.CSSImportRule && (rule.styleSheet === null || importing({sheet: rule.styleSheet, view})),
  )
}

function readableRules(sheet: CSSStyleSheet): CSSRule[] {
  try {
    return [...sheet.cssRules]
  } catch {
    return []
  }
}

function loadOf(element: Element): Promise<void> {
  return new Promise((resolve) => {
    element.addEventListener('load', () => resolve(), {once: true})
    element.addEventListener('error', () => resolve(), {once: true})
  })
}
