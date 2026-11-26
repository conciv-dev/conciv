import {createContext, Show, useContext, type Accessor, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {useEnvironmentContext} from '@ark-ui/solid/environment'
import {isShadowRoot} from './realm.js'

export const LayerAreaContext = createContext<Accessor<Readonly<Record<string, string>>>>()

export function LayerPortal(props: {children: JSX.Element}): JSX.Element {
  const environment = useEnvironmentContext()
  const area = useContext(LayerAreaContext)
  const mount = (): Node => {
    const root = environment().getRootNode()
    return isShadowRoot(root) ? root : environment().getDocument().body
  }
  return (
    <Portal mount={mount()}>
      <Show when={area?.()} fallback={props.children}>
        {(attributes) => (
          <div {...attributes()} class="contents">
            {props.children}
          </div>
        )}
      </Show>
    </Portal>
  )
}
