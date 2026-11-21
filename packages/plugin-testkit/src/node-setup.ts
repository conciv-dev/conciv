import {afterAll} from 'vitest'
import {stopFileEngines} from './file-engines.js'

afterAll(stopFileEngines)
