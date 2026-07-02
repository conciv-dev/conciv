import {defineTool} from '@conciv/extension'
import {testToolDef, TestInput} from './def.js'
import {TestCard} from './card.js'

export const testToolClient = defineTool<typeof TestInput>(testToolDef).render(TestCard)
