import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {text} from 'node:stream/consumers'
import {fileURLToPath} from 'node:url'
import {describe, expect, test} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {resource} from './otlp.js'

describe('resource', () => {
  const withResourceAttributes = test.extend<{setResourceAttributes: (value: string) => void}>({
    setResourceAttributes: async ({task: _task}, use) => {
      const previous = process.env.OTEL_RESOURCE_ATTRIBUTES
      try {
        await use((value) => {
          process.env.OTEL_RESOURCE_ATTRIBUTES = value
        })
      } finally {
        if (previous === undefined) delete process.env.OTEL_RESOURCE_ATTRIBUTES
        else process.env.OTEL_RESOURCE_ATTRIBUTES = previous
      }
    },
  })

  withResourceAttributes('parses and decodes OTEL resource attributes', ({setResourceAttributes}) => {
    setResourceAttributes(
      'service.namespace=anomalyco,team=platform%2Cobservability,label=hello%3Dworld,key%2Fname=value%20here',
    )

    expect(resource().attributes).toMatchObject({
      'service.namespace': 'anomalyco',
      team: 'platform,observability',
      label: 'hello=world',
      'key/name': 'value here',
    })
  })

  withResourceAttributes('drops OTEL resource attributes when any entry is invalid', ({setResourceAttributes}) => {
    setResourceAttributes('service.namespace=anomalyco,broken')

    expect(resource().attributes['service.namespace']).toBeUndefined()
    expect(resource().attributes['conciv.client']).toBeDefined()
  })

  withResourceAttributes('keeps built-in attributes when env values conflict', ({setResourceAttributes}) => {
    setResourceAttributes('conciv.client=web,service.instance.id=override,service.namespace=anomalyco')

    const app = {client: 'cli', version: '1.2.3', channel: 'beta'}
    expect(resource(app).attributes).toMatchObject({
      'conciv.client': 'cli',
      'service.namespace': 'anomalyco',
    })
    expect(resource(app).attributes['service.instance.id']).not.toBe('override')
    expect(resource(app).attributes['conciv.run']).toMatch(/^[0-9a-f]{8}$/)
  })
})

test('falls back to local logging when OTLP initialization fails', async () => {
  const log = tempDir('conciv-observability-test-')
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import {Effect, Layer} from 'effect'
        import {Global, Observability} from '@conciv/plugin-host'
        const roots = Global.layerWith({cache: process.env.LOG_ROOT, config: process.env.LOG_ROOT, state: process.env.LOG_ROOT, log: process.env.LOG_ROOT})
        await Effect.logInfo('after the fallback').pipe(Effect.provide(Observability.layer({endpoint: '://invalid'}).pipe(Layer.provide(roots))), Effect.scoped, Effect.runPromise)
      `,
    ],
    {
      cwd: fileURLToPath(new URL('../../..', import.meta.url)),
      env: {...process.env, LOG_ROOT: log, CONCIV_PRINT_LOGS: ''},
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  )
  const [stderr, [exitCode]] = await Promise.all([text(child.stderr), once(child, 'exit')])

  expect({exitCode, stderr}).toEqual({exitCode: 0, stderr: ''})
  expect(await readFile(path.join(log, 'conciv-local.log'), 'utf8')).toContain('message="after the fallback"')
})
