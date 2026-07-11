import {onCleanup, onMount, splitProps, useContext, type Component, type JSX} from 'solid-js'
import {HostApiContext, use, type HostWiring} from './host-context.js'

export {useExtensionValue} from './host-context.js'

export function HostApiProvider(props: Partial<HostWiring> & {children: JSX.Element}): JSX.Element {
  const parent = useContext(HostApiContext)
  const [, wiring] = splitProps(props, ['children'])
  return <HostApiContext.Provider value={{...parent, ...wiring}}>{props.children}</HostApiContext.Provider>
}

function layerComponent(hides: boolean, hook: string): Component<{when: boolean; children?: JSX.Element}> {
  return (props) => {
    const register = use('registerLayer', hook)
    onMount(() => {
      const release = register(() => props.when, hides)
      onCleanup(release)
    })
    return props.children
  }
}

const hostApi = {
  useRpc: () => use('rpc', 'useRpc'),
  useApiBase: () => use('apiBase', 'useApiBase'),
  useToast: () => use('toast', 'useToast'),
  useOpenEditor: () => use('openEditor', 'useOpenEditor'),
  useDialog: () => use('dialog', 'useDialog'),
  usePopover: () => use('popover', 'usePopover'),
  useSessionId: () => use('sessionId', 'useSessionId'),
  useGrab: () => use('grab', 'useGrab'),
  useComposerInsert: () => use('insert', 'useComposerInsert'),
  useNewSession: () => use('newSession', 'useNewSession'),
  useViewLock: () => use('viewLock', 'useViewLock'),
  useLeaveView: () => use('viewLeave', 'useLeaveView'),
  useSlot: () => use('slot', 'useSlot'),
  Suppress: layerComponent(true, 'Suppress'),
  YieldFocus: layerComponent(false, 'YieldFocus'),
}

export function getHostApi(): typeof hostApi {
  return hostApi
}
