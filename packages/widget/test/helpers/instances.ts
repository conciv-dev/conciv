import {installClientApi, type AnyExtension} from '@mandarax/extension'
import {makeWidgetClientApi} from '../../src/page/client-api.js'
import type {ExtensionInstance} from '../../src/extension/extension-slots.js'

// Mirror mountWidget for the browser component tests: install the one ClientApi, then run each
// extension's mount-time .client() into an instance. ChatPanel takes these instances directly.
export function buildInstances(extensions: AnyExtension[], apiBase: string): ExtensionInstance[] {
  installClientApi(makeWidgetClientApi({apiBase, refs: {map: new Map(), n: 0}}))
  return extensions.map((extension) => {
    const result = extension.__client?.()
    return {extension, clientValue: result?.value ?? {}, dispose: result?.dispose}
  })
}
