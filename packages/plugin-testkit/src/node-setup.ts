import {afterAll, aroundEach} from 'vitest'
import {engineTests} from './engine-tests.js'
import {stopFileEngines} from './file-engines.js'

aroundEach((runTest, context) => engineTests.run(context, runTest))

afterAll(stopFileEngines)
