import {createEffect, createSignal, onCleanup, type Accessor} from 'solid-js'

export function createAttachedWithin(
  scope: Accessor<Element | undefined>,
  node: Accessor<Node | undefined>,
): Accessor<boolean> {
  const [attached, setAttached] = createSignal(false)
  createEffect(() => {
    const container = scope()
    const target = node()
    const already = container !== undefined && target !== undefined && container.contains(target)
    setAttached(already)
    if (already || container === undefined || target === undefined) return
    const observer = new MutationObserver(() => {
      if (!container.contains(target)) return
      setAttached(true)
      observer.disconnect()
    })
    observer.observe(container, {childList: true, subtree: true})
    onCleanup(() => observer.disconnect())
  })
  return attached
}
