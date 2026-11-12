import {expectTypeOf, test} from 'vitest'
import type {ConcivConfig, ExtensionPackage} from '../src/config-types.js'

test('the extensions field is the list of installed extension packages, each carrying its own options', () => {
  expectTypeOf<ConcivConfig['extensions']>().toEqualTypeOf<readonly ExtensionPackage[] | undefined>()
})
