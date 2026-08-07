import {expectTypeOf, test} from 'vitest'
import type {RegistryCallErrorName} from '@conciv/contract'
import type {PageErrorCode} from '@conciv/protocol/page-types'
import {PAGE_ERROR_NAME} from '../../src/api/rpc/router.js'

test('every page error code maps onto a declared rpc error name, and every name is claimed', () => {
  expectTypeOf<keyof typeof PAGE_ERROR_NAME>().toEqualTypeOf<PageErrorCode>()
  expectTypeOf<(typeof PAGE_ERROR_NAME)[PageErrorCode]>().toEqualTypeOf<RegistryCallErrorName>()
})
