export function selectDeep(selector: string): Element[] {
  const light = Array.from(document.querySelectorAll(selector))
  if (light.length > 0) return light
  return openShadowRoots(document).flatMap((root) => Array.from(root.querySelectorAll(selector)))
}

function openShadowRoots(root: Document | ShadowRoot): ShadowRoot[] {
  return Array.from(root.querySelectorAll('*')).flatMap((el) =>
    el.shadowRoot === null ? [] : [el.shadowRoot, ...openShadowRoots(el.shadowRoot)],
  )
}
