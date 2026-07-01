import {expectTypeOf, test} from 'vitest'
import type {ConcivConfig} from '../src/config-types.js'

declare module '../src/config-types.js' {
  interface ExtensionConfigRegistry {
    sample: {flag?: boolean}
  }
}

test('extensions field types from the registry', () => {
  expectTypeOf<ConcivConfig['extensions']>().toMatchTypeOf<{sample?: {flag?: boolean}} | undefined>()
})
