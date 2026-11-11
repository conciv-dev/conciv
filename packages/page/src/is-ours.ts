import {CONCIV_UI_SELECTOR} from '@conciv/extension'

export function isOurs(element: Element): boolean {
  if (element.closest(CONCIV_UI_SELECTOR) !== null) return true
  const root = element.getRootNode()
  return root instanceof ShadowRoot && isOurs(root.host)
}
