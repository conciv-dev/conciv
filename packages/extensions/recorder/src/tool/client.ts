import {defineTool} from '@conciv/extension'
import {pullToolDef, startToolDef, stopToolDef} from './def.js'

export const startToolClient = defineTool(startToolDef)

export const stopToolClient = defineTool(stopToolDef)

export const pullToolClient = defineTool(pullToolDef)
