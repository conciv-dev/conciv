import {createEffect, onCleanup, type Accessor} from 'solid-js'

function focusedElement(node: Element): Element | null {
  const root = node.getRootNode()
  if (root instanceof ShadowRoot) return root.activeElement
  if (root instanceof Document) return root.activeElement
  return null
}

function focusHeldByThePage(node: Element, openedFrom: Element | null): boolean {
  const root = node.getRootNode()
  if (!(root instanceof ShadowRoot)) return false
  const active = node.ownerDocument.activeElement
  if (active === null || active === root.host || active === node.ownerDocument.body) return false
  return active !== openedFrom
}

function listHolds(nodes: NodeList, node: Node): boolean {
  for (const changed of nodes) {
    if (changed === node || changed.contains(node)) return true
  }
  return false
}

function reattaches(records: MutationRecord[], node: Node): boolean {
  return records.some((record) => listHolds(record.addedNodes, node) || listHolds(record.removedNodes, node))
}

export function anchorFocusWithin(options: {
  scope: Accessor<Element | undefined>
  anchor: Accessor<Element | undefined>
  active: Accessor<boolean>
  openedFrom: Accessor<Element | null>
  focus: () => void
}): void {
  createEffect(() => {
    const container = options.scope()
    const target = options.anchor()
    if (!options.active() || !container || !target) return
    const claim = () => {
      if (!container.contains(target)) return
      if (focusHeldByThePage(container, options.openedFrom())) return
      const focused = focusedElement(container)
      if (focused && container.contains(focused)) return
      options.focus()
    }
    claim()
    const observer = new MutationObserver((records) => {
      if (reattaches(records, target)) claim()
    })
    observer.observe(container, {childList: true, subtree: true})
    onCleanup(() => observer.disconnect())
  })
}
