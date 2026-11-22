import fs from 'node:fs/promises'
import path from 'node:path'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {Effect, Layer, Logger} from 'effect'
import {describe, expect, test} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {Global} from '../global.js'
import {file, fileLogger} from './logging.js'

function logFile(local: boolean, channel: string, log: string) {
  return file(local, channel).pipe(
    Effect.provideService(Global.Service, Global.Service.of({cache: log, config: log, state: log, log})),
    Effect.runPromise,
  )
}

describe('Logging', () => {
  test('uses a local-specific log file for local installs', async () => {
    const log = tempDir('conciv-log-test-')
    expect(await logFile(true, 'local', log)).toBe(path.join(log, 'conciv-local.log'))
  })

  test('keeps non-local installs on the default log file', async () => {
    const log = tempDir('conciv-log-test-')
    expect(await logFile(false, 'next', log)).toBe(path.join(log, 'conciv.log'))
  })
})

test('file logger appends concurrent runs with a run on every line', async () => {
  const target = path.join(tempDir('conciv-log-test-'), 'conciv.log')
  const write = (runID: string) =>
    Effect.forEach(
      Array.from({length: 50}, (_, index) => index),
      (index) => Effect.logInfo(`entry-${index}`),
    ).pipe(
      Effect.provide(Logger.layer([fileLogger(target, runID)]).pipe(Layer.provide(NodeFileSystem.layer), Layer.orDie)),
      Effect.scoped,
    )

  await Effect.runPromise(Effect.all([write('run-a'), write('run-b')], {concurrency: 'unbounded'}))

  const lines = (await fs.readFile(target, 'utf8')).trim().split('\n')
  expect(lines).toHaveLength(100)
  expect(lines.filter((line) => line.includes('run=run-a'))).toHaveLength(50)
  expect(lines.filter((line) => line.includes('run=run-b'))).toHaveLength(50)
  expect(lines.every((line) => line.startsWith('timestamp=') && line.includes(' level=INFO '))).toBe(true)
  expect(lines.every((line) => !line.includes(' fiber='))).toBe(true)
  expect(lines.every((line) => !line.startsWith('{'))).toBe(true)
})

test('file logger flattens nested objects', async () => {
  const target = path.join(tempDir('conciv-log-test-'), 'conciv.log')

  await Effect.logInfo('request complete', {
    request: {method: 'GET', timing: {duration: 42}},
    tags: ['api', 'test'],
  }).pipe(
    Effect.annotateLogs({session: {id: 'session-1'}}),
    Effect.provide(Logger.layer([fileLogger(target, 'run-a')]).pipe(Layer.provide(NodeFileSystem.layer), Layer.orDie)),
    Effect.scoped,
    Effect.runPromise,
  )

  const line = (await fs.readFile(target, 'utf8')).trim()
  expect(line).toContain('message="request complete"')
  expect(line).toContain('request.method=GET')
  expect(line).toContain('request.timing.duration=42')
  expect(line).toContain('tags="[\\"api\\",\\"test\\"]"')
  expect(line).toContain('session.id=session-1')
  expect(line).not.toContain('request={')
})
