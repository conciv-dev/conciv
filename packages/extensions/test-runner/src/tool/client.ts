import {defineTool} from '@conciv/extension'
import {testToolDef} from './def.js'
import {testCard} from './card.js'

export const testToolClient = defineTool(testToolDef).render(testCard)
