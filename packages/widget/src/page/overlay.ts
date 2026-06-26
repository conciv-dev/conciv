export const MAX_Z = '2147483647'

export function overlayLayer(el: HTMLElement, z = MAX_Z): void {
  el.style.position = 'fixed'
  el.style.zIndex = z
  el.style.pointerEvents = 'none'
  el.setAttribute('aria-hidden', 'true')
}
