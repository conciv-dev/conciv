import {installClientApi, type AnyExtension} from '@conciv/extension'
import {makeWidgetClientApi} from '../../src/page/client-api.js'
import type {ExtensionInstance} from '../../src/extension/extension-slots.js'

export function buildInstances(
  extensions: AnyExtension[],
  apiBase: string,
  activeSession: () => string | null = () => null,
): ExtensionInstance[] {
  installClientApi(makeWidgetClientApi({apiBase, refs: {map: new Map(), n: 0}, activeSession}))
  return extensions.map((extension) => {
    const result = extension.__client?.()
    return {extension, clientValue: result?.value ?? {}, dispose: result?.dispose}
  })
}
