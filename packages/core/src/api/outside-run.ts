import type {CodeCapability} from '@conciv/chat'
import {toolError} from '@conciv/extension'

const NO_TAB_MESSAGE = 'pass tab to execute_typescript; list_tabs lists the open tabs'

export function outsideRunCapabilities(capabilities: readonly CodeCapability[]): CodeCapability[] {
  return capabilities
    .filter((capability) => capability.approval !== 'ask')
    .map((capability): CodeCapability => {
      if (capability.direct === true) return capability
      return {
        ...capability,
        errors: [...capability.errors, {code: 'NO_TAB', message: NO_TAB_MESSAGE}],
        execute: () => {
          throw toolError('NO_TAB', {message: NO_TAB_MESSAGE})
        },
      }
    })
}
