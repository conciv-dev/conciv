import {onCleanup} from 'solid-js'
import {use} from './host-context.js'
import {createClientSettings} from './settings-client.js'
import type {ExtensionScope, SettingsForNamespace} from './types.js'

export function useScope<Namespace extends string>(namespace: Namespace): ExtensionScope<Namespace> {
  const rpc = use('rpc', 'useScope')
  const following = new AbortController()
  onCleanup(() => following.abort())
  return {
    namespace,
    settings: createClientSettings<SettingsForNamespace<Namespace>>(rpc, namespace, following.signal),
  }
}
