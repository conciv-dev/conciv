export function escapeInTerminal(scopeEl: HTMLElement | undefined): boolean {
  const root = scopeEl?.getRootNode()
  const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement
  return active instanceof Element && active.closest('[data-terminal-screen]') !== null
}
