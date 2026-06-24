import {expectTypeOf, test} from 'vitest'
import type {MandaraxConfig} from '../src/config-types.js'

declare module '../src/config-types.js' {
  interface ExtensionConfigRegistry {
    sample: {flag?: boolean}
  }
}

test('extensions field types from the registry', () => {
  expectTypeOf<MandaraxConfig['extensions']>().toMatchTypeOf<{sample?: {flag?: boolean}} | undefined>()
})
