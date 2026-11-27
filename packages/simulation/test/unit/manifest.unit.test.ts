import {simulationErrors} from '@conciv/errors'
import {it} from '@effect/vitest'
import {ConfigProvider, Effect, FileSystem, Layer} from 'effect'
import {describe, expect} from 'vitest'
import * as DriveManifest from '../../src/manifest.js'

describe('drive manifest', () => {
  function driveFiles(contents: unknown, drive = 'test-instance') {
    return Layer.merge(
      FileSystem.layerNoop({readFileString: () => Effect.succeed(JSON.stringify(contents))}),
      ConfigProvider.layer(ConfigProvider.fromUnknown({CONCIV_DRIVE: drive, DRIVE_REGISTRY_DIR: '/tmp/drive'})),
    )
  }

  const endpoints = {ui: 'ws://127.0.0.1:41000', backend: 'ws://127.0.0.1:41050'}

  it.effect('loads and validates a Drive manifest through Effect services, with both endpoints', () =>
    Effect.gen(function* () {
      const manifest = yield* DriveManifest.resolve().pipe(
        Effect.provide(driveFiles({endpoints, viewport: {cols: 120, rows: 40}})),
      )

      expect(manifest).toEqual({endpoints, viewport: {cols: 120, rows: 40}})
    }),
  )

  it.effect('answers the default endpoints for the instance name 1 without reading a file', () =>
    Effect.gen(function* () {
      const manifest = yield* DriveManifest.resolve().pipe(Effect.provide(driveFiles({}, '1')))

      expect(manifest).toEqual(DriveManifest.defaults)
    }),
  )

  it.effect.each([
    {name: 'a non-loopback endpoint', contents: {endpoints: {...endpoints, backend: 'https://example.com'}}},
    {name: 'a missing ui endpoint', contents: {endpoints: {backend: endpoints.backend}}},
    {name: 'a relative recording path', contents: {endpoints, recording: {timeline: 'timeline.jsonl'}}},
  ])('reports $name as a typed decode failure', ({contents}) =>
    Effect.gen(function* () {
      const error = yield* DriveManifest.resolve().pipe(Effect.flip, Effect.provide(driveFiles(contents)))

      expect(error).toMatchObject({code: simulationErrors.MANIFEST_INVALID.code})
    }),
  )
})
