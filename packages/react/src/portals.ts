import {createElement, useSyncExternalStore, type ComponentType} from 'react'
import {mountRender, requestPortal, type MountProps} from '@conciv/frontend-plugin-api'
import type {JSX} from 'solid-js'

export const PORTAL_EVENT = 'conciv:react-portal'

function Bridged<P extends object>(input: {readonly component: ComponentType<P>; readonly props: MountProps<P>}) {
  const props = useSyncExternalStore(input.props.subscribe, input.props.current)
  return createElement(input.component, props)
}

export function reactRender<P extends object>(component: ComponentType<P>): (props: P) => JSX.Element {
  return mountRender<P>((element, props) =>
    requestPortal(PORTAL_EVENT, element, createElement(Bridged<P>, {component, props})),
  )
}
