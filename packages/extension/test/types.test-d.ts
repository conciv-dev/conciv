import type {Accessor, Setter} from 'solid-js'
import {defineExtension} from '../src/define-extension.js'
import {getExtensionApi, type ExtensionApi} from '../src/extension-api.js'
import {getHostApi, HostApiProvider} from '../src/host.js'
import type {ConnectHostApi, HostWiring} from '../src/host.js'

const extension = defineExtension({name: 'canvas'})
  .client(() => {
    const value = {
      selection: (() => null) as Accessor<string | null>,
      setSelection: (() => undefined) as Setter<string | null>,
    }
    return {value}
  })
  .server(() => ({context: {}}))

function ProbeComponent() {
  const host = getHostApi()
  const slot: string = host.useSlot()
  const insert: (text: string) => void = host.useComposerInsert()
  const selection: Accessor<string | null> = extension.useContext((context) => context.selection)
  const full = extension.useContext()
  const fullSelection: Accessor<string | null> = full.selection
  return {slot, insert, selection, fullSelection}
}

const reversedOrder = defineExtension({name: 'reversed'})
  .server(() => ({context: {}}))
  .client(() => ({value: {count: 1}}))

function ReversedProbe() {
  const count: number = reversedOrder.useContext((context) => context.count)
  return count
}

function HostSurfaceProbe() {
  const provider: typeof HostApiProvider = HostApiProvider
  const wiring: Pick<HostWiring, 'connect'> = {connect: {origin: '', found: () => {}}}
  const connect: ConnectHostApi = wiring.connect
  return {provider, connect}
}

function ExtensionSurfaceProbe() {
  const api = getExtensionApi('demo')
  const slot: string = api.useSlot()
  const toast: (message: string) => void = api.useToast()
  const context: object = api.useContext()
  return {slot, toast, context}
}

type Same<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false

const extensionApiIsHostApiPlusContext: Same<keyof ExtensionApi, keyof ReturnType<typeof getHostApi> | 'useContext'> =
  true

type RootValueExports = keyof typeof import('../src/index.js')
const rootHidesHostValues: Same<Extract<RootValueExports, 'getHostApi' | 'HostApiProvider'>, never> = true

// @ts-expect-error HostWiring is host-only surface, not part of the extension barrel
import type {HostWiring as RootHostWiring} from '../src/index.js'
// @ts-expect-error ConnectHostApi is host-only surface, not part of the extension barrel
import type {ConnectHostApi as RootConnectHostApi} from '../src/index.js'

type RootHostWiringProbe = RootHostWiring
type RootConnectHostApiProbe = RootConnectHostApi

export {
  ProbeComponent,
  ReversedProbe,
  HostSurfaceProbe,
  ExtensionSurfaceProbe,
  extensionApiIsHostApiPlusContext,
  rootHidesHostValues,
}
export type {RootHostWiringProbe, RootConnectHostApiProbe}
