import {AsyncLocalStorage} from 'node:async_hooks'
import type {TestContext} from 'vitest'

export const engineTests = new AsyncLocalStorage<TestContext['onTestFinished']>()
