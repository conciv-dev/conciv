import {defineTool} from '@conciv/extension'
import {testToolDef} from './def.js'
import {TestCard} from './card.js'

export const testToolClient = defineTool(testToolDef).render(TestCard)
