import {createMemo, observable, onCleanup, onMount, type JSX} from 'solid-js'
import type {Cleanup} from './core.js'

/**
 * A contribution's props as a mount reads them. `current()` returns the props as they are now, the same object until a
 * prop changes, so it can be a framework's store snapshot. `subscribe(listener)` calls the listener once at once and
 * after any prop changes, and returns what stops the calls.
 *
 * @example
 * ```ts
 * const stop = props.subscribe(() => (element.textContent = props.current().session.id))
 * ```
 */
export interface MountProps<P> {
  current(): P
  subscribe(listener: () => void): Cleanup
}

/**
 * Draws a contribution into an element with any framework, as TanStack Devtools plugins render: the host gives the
 * element and the props, the mount draws into the element and returns what removes the drawing.
 *
 * @param element - An element the host made for this contribution, already in the page.
 * @param props - The contribution's props, read now or followed as they change.
 * @returns Removes what the mount drew. The host calls it when the contribution goes away.
 */
export type Mount<P> = (element: HTMLElement, props: MountProps<P>) => Cleanup

/**
 * Turns a framework-free mount into the render a registry takes (`Panel.render`, `Slot.render`,
 * `SettingsPage.render`, `ComposerPill.menu`, `CodeBlock.render`, `ToolRegistry.render`). The host draws an element
 * that takes no box of its own, the mount draws into it once it is in the page, and the mount's cleanup runs when the
 * host removes the contribution.
 *
 * @param mount - Draws into the element and returns what removes the drawing.
 * @returns The render to give the registry.
 *
 * @example
 * ```ts
 * ctx.add(Slot, {
 *   at: "session.header",
 *   render: mountRender<SlotMap["session.header"]>((element, props) =>
 *     props.subscribe(() => (element.textContent = props.current().session.id)),
 *   ),
 * })
 * ```
 */
export function mountRender<P extends object>(mount: Mount<P>): (props: P) => JSX.Element {
  return (props) => {
    const element = document.createElement('div')
    element.className = 'contents'
    const current = createMemo(() => ({...props}))
    const changes = observable(current)
    const subscribe = (listener: () => void): Cleanup => {
      const subscription = changes.subscribe(() => listener())
      return () => subscription.unsubscribe()
    }
    onMount(() => onCleanup(mount(element, {current, subscribe})))
    return element
  }
}
