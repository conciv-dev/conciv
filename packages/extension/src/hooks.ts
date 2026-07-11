import {
  createComponent,
  createContext,
  onCleanup,
  onMount,
  splitProps,
  useContext,
  type Component,
  type ComponentProps,
  type JSX,
} from 'solid-js'
import type {RpcClient} from '@conciv/contract'
import type {GrabApi} from '@conciv/grab'
import type {DialogApi, PopoverApi} from '@conciv/ui-kit-system'
import type {ExtensionSlot} from './types.js'

type Toast = (message: string, tone?: 'info' | 'success' | 'error') => void
type PopoverParts = {
  Root: Component<ComponentProps<PopoverApi['Root']>>
  Positioner: Component<ComponentProps<PopoverApi['Positioner']>>
  Content: Component<ComponentProps<PopoverApi['Content']>>
}

type HostWiring = {
  rpc: RpcClient
  apiBase: string
  toast: Toast
  openEditor: (file: string, line?: number) => void
  registerLayer: (isOpen: () => boolean, hides: boolean) => () => void
  dialog: DialogApi
  popover: PopoverParts
  sessionId: () => string | null
  grab: GrabApi
  insert: (text: string) => void
  newSession: () => void
  viewLock: (locked: boolean) => void
  viewLeave: () => void
  slot: ExtensionSlot
  value: object
}

const HostApiContext = createContext<Partial<HostWiring>>({})

export function HostApiProvider(props: Partial<HostWiring> & {children: JSX.Element}): JSX.Element {
  const parent = useContext(HostApiContext)
  const [, wiring] = splitProps(props, ['children'])
  return createComponent(HostApiContext.Provider, {
    get value() {
      return {...parent, ...wiring}
    },
    get children() {
      return props.children
    },
  })
}

function use<Key extends keyof HostWiring>(key: Key, hook: string): HostWiring[Key] {
  const wired = useContext(HostApiContext)[key]
  if (wired === undefined) throw new Error(`@conciv/extension: ${hook} used outside a host that provides ${key}`)
  return wired
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

export function useExtensionValue(hook: string): object {
  return use('value', hook)
}
