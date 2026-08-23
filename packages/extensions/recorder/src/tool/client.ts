import {defineTool} from '@conciv/extension'
import {pullToolDef, startToolDef, stopToolDef} from './def.js'
import {recordingToolCard} from './card.js'

export const startToolClient = defineTool(startToolDef).render(recordingToolCard)

export const stopToolClient = defineTool(stopToolDef).render(recordingToolCard)

export const pullToolClient = defineTool(pullToolDef).render(recordingToolCard)
