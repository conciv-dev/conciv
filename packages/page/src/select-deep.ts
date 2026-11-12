import {CONCIV_UI_SELECTOR} from '@conciv/extension'

export function selectDeep(selector: string): Element[] {
  return [document, ...openShadowRoots(document)].flatMap((root) => Array.from(root.querySelectorAll(selector)))
}

export function pageShadowRoot(element: Element): ShadowRoot | null {
  if (element.shadowRoot === null) return null
  return isOurs(element) ? null : element.shadowRoot
}

export function isOurs(element: Element): boolean {
  if (element.closest(CONCIV_UI_SELECTOR) !== null) return true
  const root = element.getRootNode()
  return root instanceof ShadowRoot && isOurs(root.host)
}

function openShadowRoots(root: Document | ShadowRoot): ShadowRoot[] {
  return Array.from(root.querySelectorAll('*')).flatMap((element) => {
    const shadow = pageShadowRoot(element)
    return shadow === null ? [] : [shadow, ...openShadowRoots(shadow)]
  })
}
