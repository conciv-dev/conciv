import {defineTool} from '@conciv/extension'
import {pullToolDef, startToolDef, stopToolDef} from './def.js'
import {RecordingToolCard} from './card.js'

export const startToolClient = defineTool(startToolDef).render(RecordingToolCard)

export const stopToolClient = defineTool(stopToolDef).render(RecordingToolCard)

export const pullToolClient = defineTool(pullToolDef).render(RecordingToolCard)
