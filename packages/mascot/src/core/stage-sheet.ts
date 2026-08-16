const DEFAULT_STAGE_RULE = ':where([data-scope="mascot"][data-part="root"]){width:44px;height:44px}'

type StageRoot = Document | ShadowRoot

const sheets = new WeakMap<Document, CSSStyleSheet>()

const stageRootOf = (element: HTMLElement): StageRoot | undefined => {
  const root = element.getRootNode()
  if (root instanceof ShadowRoot) return root
  if (root instanceof Document) return root
  return undefined
}

function sheetFor(owner: Document): CSSStyleSheet | undefined {
  const existing = sheets.get(owner)
  if (existing !== undefined) return existing
  const view = owner.defaultView
  if (view === null || typeof view.CSSStyleSheet !== 'function') return undefined
  const created = new view.CSSStyleSheet()
  created.replaceSync(DEFAULT_STAGE_RULE)
  sheets.set(owner, created)
  return created
}

export function installStageSize(element: HTMLElement): void {
  const root = stageRootOf(element)
  if (root === undefined) return
  const sheet = sheetFor(element.ownerDocument)
  if (sheet === undefined || root.adoptedStyleSheets.includes(sheet)) return
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
}
