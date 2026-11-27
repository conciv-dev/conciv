import {createElement, type ComponentChild, type ComponentType} from 'preact'
import {useSyncExternalStore} from 'preact/compat'
import {mountRender, type MountProps} from '@conciv/frontend-plugin-api'
import type {JSX} from 'solid-js'

const PORTAL_EVENT = 'conciv:preact-portal'

type PortalRequest = {
  readonly element: HTMLElement
  readonly node: ComponentChild
  readonly placed: (remove: () => void) => void
}

function isPortalRequest(value: unknown): value is PortalRequest {
  if (typeof value !== 'object' || value === null) return false
  if (!('element' in value) || !(value.element instanceof HTMLElement)) return false
  return 'node' in value && 'placed' in value && typeof value.placed === 'function'
}

function Bridged<P extends object>(input: {readonly component: ComponentType<P>; readonly props: MountProps<P>}) {
  const props = useSyncExternalStore(input.props.subscribe, input.props.current)
  return createElement(input.component, props)
}

export function preactRender<P extends object>(component: ComponentType<P>): (props: P) => JSX.Element {
  return mountRender<P>((element, props) => {
    const removals: Array<() => void> = []
    const detail: PortalRequest = {
      element,
      node: createElement(Bridged<P>, {component, props}),
      placed: (remove) => removals.push(remove),
    }
    element.dispatchEvent(new CustomEvent(PORTAL_EVENT, {bubbles: true, composed: true, detail}))
    if (removals.length === 0) throw new Error('a Preact contribution rendered outside <ConcivWidget/>')
    return () => removals.forEach((remove) => remove())
  })
}

export function listenForPortals(
  host: HTMLElement,
  place: (element: HTMLElement, node: ComponentChild) => () => void,
): () => void {
  const listener = (event: Event) => {
    if (!(event instanceof CustomEvent) || !isPortalRequest(event.detail)) return
    event.stopPropagation()
    event.detail.placed(place(event.detail.element, event.detail.node))
  }
  host.addEventListener(PORTAL_EVENT, listener)
  return () => host.removeEventListener(PORTAL_EVENT, listener)
}
