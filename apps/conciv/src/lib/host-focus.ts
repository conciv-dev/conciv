export function hostFocusTarget(widgetContainer: HTMLElement): HTMLElement | null {
  let active: Element | null = document.activeElement
  while (active) {
    if (widgetContainer.contains(active)) return null
    const inner = active.shadowRoot?.activeElement
    if (!inner) break
    active = inner
  }
  if (!(active instanceof HTMLElement)) return null
  if (active === document.body) return null
  return active
}

export function hostPageHasFocus(rootNode: Node): boolean {
  const active = document.activeElement
  if (active === null || active === document.body || active === document.documentElement) return false
  if (rootNode instanceof ShadowRoot) return active !== rootNode.host
  return !rootNode.contains(active)
}
