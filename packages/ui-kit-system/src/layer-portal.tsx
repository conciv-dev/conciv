import type {JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {useEnvironmentContext} from '@ark-ui/solid/environment'
import {isShadowRoot} from './realm.js'

export function LayerPortal(props: {children: JSX.Element}): JSX.Element {
  const environment = useEnvironmentContext()
  const mount = (): Node => {
    const root = environment().getRootNode()
    return isShadowRoot(root) ? root : environment().getDocument().body
  }
  return <Portal mount={mount()}>{props.children}</Portal>
}
