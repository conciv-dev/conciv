const STAGE_SELECTOR = ':where([data-scope="mascot"][data-part="root"])'

const DEFAULT_STAGE_RULE = `${STAGE_SELECTOR}{width:44px;height:44px}`

type StageRoot = Document | ShadowRoot

const findStageRoot = (element: HTMLElement): StageRoot | undefined => {
  const root = element.getRootNode()
  if (root instanceof ShadowRoot) return root
  if (root instanceof Document) return root
  return undefined
}

function isStageSheet(sheet: CSSStyleSheet): boolean {
  return sheet.cssRules.length === 1 && (sheet.cssRules[0]?.cssText.startsWith(STAGE_SELECTOR) ?? false)
}

function createStageSheet(owner: Document): CSSStyleSheet | undefined {
  const view = owner.defaultView
  if (view === null || typeof view.CSSStyleSheet !== 'function') return undefined
  const created = new view.CSSStyleSheet()
  created.replaceSync(DEFAULT_STAGE_RULE)
  return created
}

export function installStageSize(element: HTMLElement): void {
  const root = findStageRoot(element)
  if (root === undefined || root.adoptedStyleSheets.some(isStageSheet)) return
  const sheet = createStageSheet(element.ownerDocument)
  if (sheet === undefined) return
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
}
