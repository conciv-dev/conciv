import {isOurs} from './is-ours.js'

export function pageShadowRoot(element: Element): ShadowRoot | null {
  if (element.shadowRoot === null) return null
  return isOurs(element) ? null : element.shadowRoot
}
