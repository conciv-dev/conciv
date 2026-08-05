import {expectTypeOf, test} from 'vitest'
import type {z} from 'zod'
import type {PageQueryInput} from '@conciv/protocol/page-types'
import type {BuiltinPageTool} from '../src/builtins.js'

type DeclaredPageInput = z.infer<BuiltinPageTool['inputSchema']>

test('every value a page tool declares is typed the way the page query carries it', () => {
  expectTypeOf<DeclaredPageInput>().toExtend<PageQueryInput>()
})
