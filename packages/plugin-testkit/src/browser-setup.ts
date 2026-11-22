import {afterAll, afterEach, inject} from 'vitest'
import {commands, page} from 'vitest/browser'
import {cleanup, configure} from '@solidjs/testing-library'
import {providePageErrors} from './page-errors.js'
import type {} from './browser-commands.js'

configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})

afterEach(cleanup)

const viewport = inject('concivViewport')
afterEach(() => page.viewport(viewport.width, viewport.height))

providePageErrors({watch: () => commands.concivWatchPage(), read: () => commands.concivPageErrors()})

afterAll(() => commands.concivStopFileEngines())
