import {afterAll, inject} from 'vitest'
import {commands} from 'vitest/browser'
import {configure} from '@solidjs/testing-library'
import {failOnUnreadPageErrors} from './page-errors.js'
import type {} from './browser-commands.js'

configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})

failOnUnreadPageErrors({watch: () => commands.concivWatchPage(), read: () => commands.concivPageErrors()})

afterAll(() => commands.concivStopFileEngines())
