import {afterAll, aroundEach} from 'vitest'
import {engineTests} from './engine-tests.js'
import {stopFileEngines} from './file-engines.js'

aroundEach((runTest, {onTestFinished}) => engineTests.run(onTestFinished, runTest))

afterAll(stopFileEngines)
