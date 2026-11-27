import {createMemo, observable, onCleanup, onMount, type JSX} from 'solid-js'
import type {Cleanup} from './core.js'
import {widgetPluginErrors} from '@conciv/errors'

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
    element.style.display = 'contents'
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

type PortalRequest<N> = {
  readonly element: HTMLElement
  readonly node: N
  readonly placed: (remove: () => void) => void
}

function isPortalRequest<N>(value: unknown): value is PortalRequest<N> {
  if (typeof value !== 'object' || value === null) return false
  if (!('element' in value) || !(value.element instanceof HTMLElement)) return false
  return 'node' in value && 'placed' in value && typeof value.placed === 'function'
}

/**
 * Asks the framework root above `element` to draw `node` into it through a portal: sends `event` as a composed DOM
 * event that leaves the app's shadow root. A framework adapter calls it from its mount; `listenForPortals` with the
 * same event answers.
 *
 * @param event - The adapter's event name.
 * @param element - The mount's element, already in the page.
 * @param node - What the framework draws into the element.
 * @returns Removes the portal.
 *
 * @example
 * ```ts
 * mountRender((element, props) => requestPortal("conciv:react-portal", element, createElement(View, {props})))
 * ```
 */
export function requestPortal<N>(event: string, element: HTMLElement, node: N): Cleanup {
  const removals: Array<() => void> = []
  const detail: PortalRequest<N> = {element, node, placed: (remove) => removals.push(remove)}
  element.dispatchEvent(new CustomEvent(event, {bubbles: true, composed: true, detail}))
  if (removals.length === 0) throw widgetPluginErrors.PORTAL_NOT_PLACED({event})
  return () => removals.forEach((remove) => remove())
}

/**
 * Answers `requestPortal` for the contributions drawn under `host`: `place` puts the node into its element and
 * returns what removes it.
 *
 * @param host - The element the framework root renders the app into.
 * @param event - The adapter's event name, the one its `requestPortal` sends.
 * @param place - Draws a node into an element; returns what removes it.
 * @returns Stops listening.
 *
 * @example
 * ```ts
 * const stop = listenForPortals<ReactNode>(host, "conciv:react-portal", (element, node) => add({element, node}))
 * ```
 */
export function listenForPortals<N>(
  host: HTMLElement,
  event: string,
  place: (element: HTMLElement, node: N) => () => void,
): () => void {
  const listener = (incoming: Event) => {
    if (!(incoming instanceof CustomEvent) || !isPortalRequest<N>(incoming.detail)) return
    incoming.stopPropagation()
    incoming.detail.placed(place(incoming.detail.element, incoming.detail.node))
  }
  host.addEventListener(event, listener)
  return () => host.removeEventListener(event, listener)
}
