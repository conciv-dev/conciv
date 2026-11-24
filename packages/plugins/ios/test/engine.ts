import {resolve} from 'node:path'
import {engineFixture} from '@conciv/core/testing'

export const createEngine = engineFixture()

export const IOS_PLUGIN = resolve(import.meta.dirname, '..')
