import {resolve} from 'node:path'
import {createEngineTest} from '@conciv/core/testing'

export const test = createEngineTest()

export const IOS_PLUGIN = resolve(import.meta.dirname, '..')
