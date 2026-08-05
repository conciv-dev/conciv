import {expectTypeOf, test} from 'vitest'
import type {ConcivConfig} from '../src/config-types.js'

declare module '../src/config-types.js' {
  interface ExtensionRegistry {
    sample: {config: {flag?: boolean}; context: Record<never, never>; tools: Record<never, never>}
  }
}

test('the extensions field carries each registered extension config, not the whole registry entry', () => {
  expectTypeOf<ConcivConfig['extensions']>().toMatchTypeOf<{sample?: {flag?: boolean}} | undefined>()
  expectTypeOf<NonNullable<ConcivConfig['extensions']>['sample']>().toEqualTypeOf<{flag?: boolean} | undefined>()
})
