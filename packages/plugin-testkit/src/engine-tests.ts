import {AsyncLocalStorage} from 'node:async_hooks'
import type {TestContext} from 'vitest'

export const engineTests: AsyncLocalStorage<TestContext['onTestFinished']> = new AsyncLocalStorage()
