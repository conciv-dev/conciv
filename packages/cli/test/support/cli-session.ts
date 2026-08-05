import {afterEach, beforeEach, vi} from 'vitest'
import {captureStdout} from './stdout.js'

export type CliSession = {cleanups: (() => Promise<void>)[]; written: string[]}

export function cliSession(): CliSession {
  const session: CliSession = {cleanups: [], written: []}
  beforeEach(() => {
    captureStdout(session.written)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    delete process.env.CONCIV_PORT
    for (const cleanup of session.cleanups.splice(0)) await cleanup()
  })
  return session
}
