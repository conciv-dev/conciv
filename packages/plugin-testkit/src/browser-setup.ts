import {afterAll, inject} from 'vitest'
import {commands} from 'vitest/browser'
import {configure} from '@solidjs/testing-library'
import type {} from './browser-commands.js'

configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})

afterAll(() => commands.concivStopFileEngines())
