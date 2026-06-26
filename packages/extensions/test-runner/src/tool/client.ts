import {defineTool} from '@mandarax/extension'
import {testToolDef, TestInput} from './def.js'
import {TestCard} from './card.js'

// Client view of the tool: the co-located card renders the result. No execute (server-only).
export const testToolClient = defineTool<typeof TestInput>(testToolDef).render(TestCard)
