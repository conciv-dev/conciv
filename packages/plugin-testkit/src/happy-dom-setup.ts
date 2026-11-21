import {afterEach, inject} from 'vitest'
import {cleanup, configure} from '@solidjs/testing-library'
import type {} from './browser-commands.js'

configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})

afterEach(cleanup)
