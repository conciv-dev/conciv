import {afterAll, afterEach, inject} from 'vitest'
import {commands} from 'vitest/browser'
import {cleanup, configure} from '@solidjs/testing-library'
import {providePageErrors} from './page-errors.js'
import type {} from './browser-commands.js'

configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})

afterEach(cleanup)

providePageErrors({watch: () => commands.concivWatchPage(), read: () => commands.concivPageErrors()})

afterAll(() => commands.concivStopFileEngines())
