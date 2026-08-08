import {createEffect, onCleanup, type Accessor} from 'solid-js'

function focusedElement(node: Element): Element | null {
  const root = node.getRootNode()
  if (root instanceof ShadowRoot) return root.activeElement
  if (root instanceof Document) return root.activeElement
  return null
}

export function anchorFocusWithin(options: {
  scope: Accessor<Element | undefined>
  anchor: Accessor<Element | undefined>
  active: Accessor<boolean>
  focus: () => void
}): void {
  createEffect(() => {
    const container = options.scope()
    const target = options.anchor()
    if (!options.active() || !container || !target) return
    const claim = () => {
      if (!container.contains(target)) return
      const focused = focusedElement(container)
      if (focused && container.contains(focused)) return
      options.focus()
    }
    claim()
    const observer = new MutationObserver(claim)
    observer.observe(container, {childList: true, subtree: true})
    onCleanup(() => observer.disconnect())
  })
}
