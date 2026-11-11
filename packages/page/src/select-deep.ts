import {CONCIV_UI_SELECTOR} from '@conciv/extension'

export function selectDeep(selector: string): Element[] {
  const light = Array.from(document.querySelectorAll(selector))
  if (light.length > 0) return light
  return openShadowRoots(document).flatMap((root) => Array.from(root.querySelectorAll(selector)))
}

function openShadowRoots(root: Document | ShadowRoot): ShadowRoot[] {
  return Array.from(root.querySelectorAll('*')).flatMap((element) => {
    const shadow = element.closest(CONCIV_UI_SELECTOR) === null ? element.shadowRoot : null
    return shadow === null ? [] : [shadow, ...openShadowRoots(shadow)]
  })
}
