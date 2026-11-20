import {afterAll} from 'vitest'
import {stopFileEngines} from './engine.js'

afterAll(stopFileEngines)
