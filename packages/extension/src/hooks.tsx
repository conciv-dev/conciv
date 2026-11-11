import {onCleanup, onMount, splitProps, useContext, type Component, type JSX} from 'solid-js'
import {HostApiContext, use, type HostWiring} from './host-context.js'
import {useScope} from './use-scope.js'

export {useExtensionValue} from './host-context.js'

export function HostApiProvider(props: Partial<HostWiring> & {children: JSX.Element}): JSX.Element {
  const parent = useContext(HostApiContext)
  const [, wiring] = splitProps(props, ['children'])
  return <HostApiContext.Provider value={{...parent, ...wiring}}>{props.children}</HostApiContext.Provider>
}

function layerComponent(hides: boolean, hook: string): Component<{when: boolean; children?: JSX.Element}> {
  return function LayerGate(props): JSX.Element {
    const registerLayer = use('registerLayer', hook)
    onMount(() => onCleanup(registerLayer(() => props.when, hides)))
    return <>{props.children}</>
  }
}

const hostApi = {
  useRpc: (): HostWiring['rpc'] => use('rpc', 'useRpc'),
  useScope,
  useApiBase: (): HostWiring['apiBase'] => use('apiBase', 'useApiBase'),
  useToast: (): HostWiring['toast'] => use('toast', 'useToast'),
  useOpenEditor: (): HostWiring['openEditor'] => use('openEditor', 'useOpenEditor'),
  useDialog: (): HostWiring['dialog'] => use('dialog', 'useDialog'),
  usePopover: (): HostWiring['popover'] => use('popover', 'usePopover'),
  useSessionId: (): HostWiring['sessionId'] => use('sessionId', 'useSessionId'),
  useGrab: (): HostWiring['grab'] => use('grab', 'useGrab'),
  useComposerInsert: (): HostWiring['insert'] => use('insert', 'useComposerInsert'),
  useComposerAttach: (): HostWiring['attach'] => use('attach', 'useComposerAttach'),
  useNewSession: (): HostWiring['newSession'] => use('newSession', 'useNewSession'),
  useViewLock: (): HostWiring['viewLock'] => use('viewLock', 'useViewLock'),
  useLeaveView: (): HostWiring['viewLeave'] => use('viewLeave', 'useLeaveView'),
  useSlot: (): HostWiring['slot'] => use('slot', 'useSlot'),
  useConnect: (): HostWiring['connect'] => use('connect', 'useConnect'),
  useColorScheme: (): HostWiring['colorScheme'] => use('colorScheme', 'useColorScheme'),
  Suppress: layerComponent(true, 'Suppress'),
  YieldFocus: layerComponent(false, 'YieldFocus'),
}

export function getHostApi(): typeof hostApi {
  return hostApi
}
