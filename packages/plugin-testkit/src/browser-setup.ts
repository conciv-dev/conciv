import {afterAll, afterEach, beforeEach, inject} from 'vitest'
import {commands, page, server} from 'vitest/browser'
import {cleanup, configure} from '@solidjs/testing-library'
import {providePageErrors} from './page-errors.js'
import {freshProfileAfter} from './fresh-profile.js'
import type {} from './browser-commands.js'

configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})

beforeEach(({onTestFinished}) => freshProfileAfter(onTestFinished))

afterEach(cleanup)

const SHOT_NAME_MAX = 200

afterEach(async ({task}) => {
  if (task.result?.state !== 'fail') return
  const name = task.fullTestName.replace(/\W/g, '-')
  const capped = name.length > SHOT_NAME_MAX ? `${name.slice(0, SHOT_NAME_MAX)}-${task.id}` : name
  const file = task.file.filepath.split('/').at(-1) ?? 'test'
  await page.screenshot({path: `${server.config.attachmentsDir}/failure-screenshots/${file}/${capped}.png`})
})

const viewport = inject('concivViewport')
afterEach(() => page.viewport(viewport.width, viewport.height))

providePageErrors({watch: () => commands.concivWatchPage(), read: () => commands.concivPageErrors()})

afterAll(() => commands.concivStopFileEngines())
